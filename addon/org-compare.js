/* global React ReactDOM */
import {sfConn, apiVersion} from "./inspector.js";

import {PageHeader} from "./components/PageHeader.js";
import {UserInfoModel, createSpinForMethod} from "./utils.js";

const categories = [
  { id: "profiles", label: "Profiles", icon: "user_role", color: "#6ca1fb", group: "Security", description: "Compare User Permissions, Object Permissions, Field Permissions, and more between Profiles.", metaType: "Profile" },
  { id: "permSets", label: "Permission Sets", icon: "lock", color: "#f77e2e", group: "Security", description: "Compare System and Object permissions between Permission Sets.", metaType: "PermissionSet" },
  { id: "permSetGroups", label: "Permission Set Group Summary", icon: "groups", color: "#eb6c61", group: "Security", description: "Compare composition and effective permissions of Permission Set Groups.", metaType: "PermissionSetGroup" },
  { id: "users", label: "User Summary", icon: "user", color: "#4bca81", group: "Security", description: "Compare User record fields (Profile, Role, etc.) and assigned permissions.", metaType: "User" }
];

class Model {
  constructor(sfHost, sessionId, args) {
    this.sfHost = sfHost;
    this.sessionId = sessionId;
    this.args = args;
    this.sfLink = "https://" + this.sfHost;
    this.spinnerCount = 0;
    this.orgName = this.sfHost.split(".")[0]?.toUpperCase() || "";

    this.spinFor = createSpinForMethod(this);
    this.userInfoModel = new UserInfoModel(this.spinFor.bind(this));
  }

  didUpdate(cb) {
    if (this.reactCallback) {
      this.reactCallback(cb);
    }
  }
}

const h = React.createElement;

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedCategory: categories.find(c => c.id === "profiles"),
      selectedItems: [],
      availableItems: [], // Items extracted from org to pick from
      comparisonData: null, // The processed data to display
      isLoading: false,
      filterText: "",
      showDiffOnly: false
    };
    this.onCategorySelect = this.onCategorySelect.bind(this);
    this.loadAvailableItems = this.loadAvailableItems.bind(this);
    this.onItemSelect = this.onItemSelect.bind(this);
    this.onSimpleCompare = this.onSimpleCompare.bind(this);
    this.renderComparisonTable = this.renderComparisonTable.bind(this);
    this.toggleDiffOnly = this.toggleDiffOnly.bind(this);
    
    // Initial load for default category
    setTimeout(() => this.loadAvailableItems("profiles"), 0);
  }

  onCategorySelect(category) {
    this.setState({ selectedCategory: category, selectedItems: [], availableItems: [], comparisonData: null }, () => {
      this.loadAvailableItems(category.id);
    });
  }

  toggleDiffOnly() {
      this.setState({ showDiffOnly: !this.state.showDiffOnly });
  }

  async loadAvailableItems(categoryId) {
    const { model } = this.props;
    this.setState({ isLoading: true });
    
    try {
        if (categoryId === "profiles") {
            // Reverted to SOQL because compareProfiles uses REST API which works best with Profile Names (e.g. System Administrator)
            // and IDs, rather than Metadata API Names (e.g. Admin)
        }

        let query = "";
        
        switch (categoryId) {
            case "profiles":
            case "fls":
                query = "SELECT Id, Name FROM Profile ORDER BY Name";
                break;
            case "permSets":
                query = "SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label";
                break;
            case "permSetGroups":
                query = "SELECT Id, DeveloperName, MasterLabel FROM PermissionSetGroup ORDER BY MasterLabel";
                break;
            case "layouts":
                // Tooling API for Layouts
                query = "SELECT Id, Name, TableEnumOrId FROM Layout ORDER BY TableEnumOrId, Name";
                break;
            case "roles":
                query = "SELECT Id, Name, DeveloperName FROM UserRole ORDER BY Name";
                break;
            case "groups":
                query = "SELECT Id, Name, DeveloperName FROM Group WHERE Type = 'Regular' ORDER BY Name";
                break;
            case "objects":
                query = "SELECT QualifiedApiName, Label FROM EntityDefinition ORDER BY Label";
                break;
            case "users":
                query = "SELECT Id, Username, Name FROM User WHERE IsActive = true ORDER BY Name";
                break;
            case "audit":
                // No items to pick
                break;
             // Sharing: tricky to list "Sharing Rules" as items. 
             // Maybe list objects effectively? sharing is per object usually.
             case "sharing":
                query = "SELECT QualifiedApiName, Label FROM EntityDefinition ORDER BY Label";
                break;
        }

        if (query) {
             let apiPath = categoryId === "layouts" ? "/tooling/query?q=" : "/query/?q=";
             await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + apiPath + encodeURIComponent(query)).then(res => {
                 const records = res.records.map(r => {
                     let label = r.Label || r.MasterLabel || r.Name;
                     let name = r.QualifiedApiName || r.DeveloperName || r.Name;
                     if (categoryId === "layouts") {
                        label = `${r.TableEnumOrId} - ${r.Name}`;
                        name = `${r.TableEnumOrId}-${r.Name}`; 
                     }
                     return { ...r, Label: label, Name: name };
                 });
                 this.setState({ availableItems: records });
             }));
        } else if (categoryId === "audit") {
             this.setState({ availableItems: [] });
        }
    } catch (e) {
        console.error(e);
        alert("Error loading items: " + e.message);
    } finally {
        this.setState({ isLoading: false });
    }
  }

  onItemSelect(e, item) {
     const isChecked = e.target.checked;
     const { selectedItems } = this.state;
     if (isChecked) {
         this.setState({ selectedItems: [...selectedItems, item] });
     } else {
         this.setState({ selectedItems: selectedItems.filter(i => i.Id !== item.Id) });
     }
  }

  async onSimpleCompare() {
      const { selectedCategory, selectedItems } = this.state;
      const { model } = this.props;
      if (selectedCategory.id !== "audit" && selectedItems.length < 1) return; 

      this.setState({ isLoading: true });

      try {
           console.log("Starting comparison for:", selectedCategory.id, selectedItems);
            
           // Audit Trail Handling (Existing)
           if (selectedCategory.id === "audit") {
               const res = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent("SELECT Action, Display, CreatedBy.Name, CreatedDate, Section FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 500")));
               const rows = res.records.map((r, i) => ({
                   key: i,
                   values: [r.Action, r.Display, r.Section, r.CreatedBy.Name, r.CreatedDate]
               }));
               this.setState({
                   comparisonData: {
                       type: "generic",
                       headers: ["Action", "Display", "Section", "User", "Date"], 
                       rows: rows.map(r => ({ key: r.key, values: r.values }))
                   }
               });
               return; // Exit early for audit
           }

           // Metadata Comparison
           const itemNames = selectedItems.map(i => i.Name);
           let type = selectedCategory.metaType;
           if (selectedCategory.id === "sharing") type = "SharingRules";

           const chunks = [];
           for (let i = 0; i < itemNames.length; i += 10) {
               chunks.push(itemNames.slice(i, i + 10));
           }

           // Only fetch Metadata API chunks if NOT doing User comparison or Sharing (handled differently or shares type)
           // Actually Users uses REST, others use SOAP Metadata.
           let allMetadata = [];
           
           if (selectedCategory.id !== "users" && selectedCategory.id !== "audit" && selectedCategory.id !== "profiles") {
             // 1. Fetch Metadata (Metadata API)
             // We'll read 10 items at a time
             for (const chunk of chunks) {
                 const res = await model.spinFor(sfConn.soap(sfConn.wsdl(apiVersion, "Metadata"), "readMetadata", { type: type, fullNames: chunk }));
                 if (Array.isArray(res)) allMetadata.push(...res);
                 else if (res) allMetadata.push(res);
             }
             
             if (allMetadata.length === 0) {
                 alert("No metadata retrieved. Check console for permissions or API errors.");
                 return;
             }
         }

         if (selectedCategory.id === "profiles") {
             // Pass selectedItems to get IDs for Tooling API usage
             await this.compareProfiles(selectedItems);
         } else if (selectedCategory.id === "permSets") {
             await this.comparePermSets(selectedItems);
         } else if (selectedCategory.id === "permSetGroups") {
             await this.comparePermSetGroups(selectedItems);
         } else if (selectedCategory.id === "users") {
             await this.compareUsers(selectedItems);
         } else {
             this.processGenericComparison(itemNames, allMetadata);
         }
      } catch (e) {
          console.error("Comparison Error:", e);
          alert("Error during comparison: " + e.message);
      } finally {
          this.setState({ isLoading: false });
      }
  }

  async compareUsers(users) {
      const { model } = this.props;
      const userIds = users.map(u => u.Id);
      const userIdsString = userIds.map(id => `'${id}'`).join(",");

      // 1. Fetch User Details
      const userQuery = `SELECT Id, Name, Username, IsActive, Profile.Name, UserRole.Name, Profile.UserLicense.Name FROM User WHERE Id IN (${userIdsString})`;
      const userRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(userQuery)));
      console.log(userIdsString)
      const userMap = {};
      if (userRes && userRes.records) {
          userRes.records.forEach(u => userMap[u.Id] = u);
      }

      // 2. Fetch Permission Set Assignments (includes Profile-owned)
      const psaQuery = `SELECT AssigneeId, PermissionSetId, PermissionSet.Name, PermissionSet.Label, PermissionSet.IsOwnedByProfile, PermissionSet.Profile.Name FROM PermissionSetAssignment WHERE AssigneeId IN (${userIdsString})`;
      const psaRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(psaQuery)));
      console.log("PS Assignments:", psaRes);

      const userPermSets = {}; 
      const allPermSetIds = new Set();
      
      if (psaRes && psaRes.records) {
          psaRes.records.forEach(psa => { 
              if (!userPermSets[psa.AssigneeId]) userPermSets[psa.AssigneeId] = [];
              if (psa.PermissionSet) { 
                  userPermSets[psa.AssigneeId].push({
                      id: psa.PermissionSetId,
                      label: psa.PermissionSet.Label,
                      isProfile: psa.PermissionSet.IsOwnedByProfile,
                      profileName: psa.PermissionSet.Profile?.Name
                  });
              }
              allPermSetIds.add(psa.PermissionSetId);
          });
      }

      // 3. Fetch Group Membership
      const groupQuery = `SELECT UserOrGroupId, Group.Name, Group.DeveloperName, Group.Type FROM GroupMember WHERE UserOrGroupId IN (${userIdsString})`;
      const groupRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(groupQuery)));
      console.log("Groups:", groupRes);

      const userGroups = {};
      if (groupRes && groupRes.records) {
          groupRes.records.forEach(gm => {
              if (gm.Group) { 
                if (!userGroups[gm.UserOrGroupId]) userGroups[gm.UserOrGroupId] = [];
                userGroups[gm.UserOrGroupId].push(gm.Group.Name);
              }
          });
      }

      // 4. Fetch Object Permissions for ALL involved Permission Sets
      const permSetIdsArray = Array.from(allPermSetIds); 
      let objPermsRes = { records: [] };
      if (permSetIdsArray.length > 0) {
          const permSetIdsString = permSetIdsArray.map(id => `'${id}'`).join(",");
          const objPermQuery = `SELECT ParentId, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId IN (${permSetIdsString}) ORDER BY SobjectType`;
          objPermsRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(objPermQuery)));
          console.log("Obj Perms:", objPermsRes);
      }

      // 5. Fetch System Permissions
      let sysPermRes = { records: [] };
      if (permSetIdsArray.length > 0) {
           const permSetIdsString = permSetIdsArray.map(id => `'${id}'`).join(",");
           const sysPermQuery = `SELECT Id, PermissionsApiEnabled, PermissionsModifyAllData, PermissionsViewAllData, PermissionsCustomizeApplication, PermissionsManageUsers FROM PermissionSet WHERE Id IN (${permSetIdsString})`;
           sysPermRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(sysPermQuery)));
           console.log("Sys Perms:", sysPermRes);
      }


      // --- AGGREGATION ---
      const rows = users.map(u => u.Name);
      // We need to store data relative to User Name (Row Key)
      
      const userData = {}; // Map<UserName, { details: {}, sys: {}, objects: {}, perms: {}, groups: {} }>

      users.forEach(u => {
          const uid = u.Id;
          const uInfo = userMap[uid];
          
          if (!uInfo) {
              console.warn(`User info not found for ID: ${uid} (Name: ${u.Name})`);
              // Initialize with available basic info if detailed fetch failed for this user
              userData[u.Name] = {
                  details: {
                      "Id": uid,
                      "Username": "Data Missing",
                      "Active": "-",
                      "Profile": "-",
                      "Role": "-",
                      "License": "-"
                  },
                  sys: {}, objects: {}, perms: {}, groups: {}
              };
              return;
          }

          const name = u.Name; // Use Name from input or fetched info? Input usually has Name.

          userData[name] = { 
              details: {
                  "Id": uInfo.Id,
                  "Username": uInfo.Username,
                  "Active": uInfo.IsActive,
                  "Profile": uInfo.Profile?.Name,
                  "Role": uInfo.UserRole?.Name,
                  "License": uInfo.Profile?.UserLicense?.Name
              },
              sys: {},
              objects: {},
              perms: {},
              groups: {}
          };

          // Perm Sets (System) -> actually assigned perm sets list
          (userPermSets[uid] || []).forEach(ps => {
             // We want to list these? 
             // In transposed view: Column = Perm Set Name? Or just "Assigned Sets" column?
             // If we want columns = Perm Set Names, we need all unique perm sets as columns.
          });
          
          // System Permissions
          const userPsIds = (userPermSets[uid] || []).map(ps => ps.id);
          userPsIds.forEach(psId => {
              const psRec = sysPermRes.records.find(r => r.Id === psId);
              if (psRec) {
                  if (psRec.PermissionsApiEnabled) userData[name].sys["Api Enabled"] = true;
                  if (psRec.PermissionsModifyAllData) userData[name].sys["Modify All"] = true;
                  if (psRec.PermissionsViewAllData) userData[name].sys["View All"] = true;
                  if (psRec.PermissionsCustomizeApplication) userData[name].sys["Customize App"] = true;
                  if (psRec.PermissionsManageUsers) userData[name].sys["Manage Users"] = true;
              }
          });

          // Object Permissions
          objPermsRes.records.filter(op => userPsIds.includes(op.ParentId)).forEach(op => {
               if (!userData[name].objects[op.SobjectType]) {
                   userData[name].objects[op.SobjectType] = { Read: false, Create: false, Edit: false, Delete: false, ViewAll: false, ModifyAll: false };
               }
               const effective = userData[name].objects[op.SobjectType];
               effective.Read = effective.Read || op.PermissionsRead;
               effective.Create = effective.Create || op.PermissionsCreate;
               effective.Edit = effective.Edit || op.PermissionsEdit;
               effective.Delete = effective.Delete || op.PermissionsDelete;
               effective.ViewAll = effective.ViewAll || op.PermissionsViewAllRecords;
               effective.ModifyAll = effective.ModifyAll || op.PermissionsModifyAllRecords;
          });
          
          // Groups
          (userGroups[uid] || []).forEach(gName => {
              userData[name].groups[gName] = true;
          });
      });

      // Collect all unique keys for columns
      const detailKeys = ["Id", "Username", "Active", "Profile", "Role", "License"];
      const sysKeys = ["Api Enabled", "Modify All", "View All", "Customize App", "Manage Users"];
      
      const allObjects = new Set();
      Object.values(userData).forEach(d => Object.keys(d.objects).forEach(k => allObjects.add(k)));
      const sortedObjects = Array.from(allObjects).sort();

      const allGroups = new Set();
      Object.values(userData).forEach(d => Object.keys(d.groups).forEach(k => allGroups.add(k)));
      const sortedGroups = Array.from(allGroups).sort();


      this.setState({
          comparisonData: {
              type: "structured_profile_transposed", 
              rows: rows,
              sections: [
                  { 
                      title: "User Details", 
                      keys: detailKeys, 
                      subCols: ["Value"], 
                      getData: (itemName, key) => ({ Value: userData[itemName].details[key] }) 
                  },
                  { 
                      title: "System Permissions (Sample)", 
                      keys: sysKeys, 
                      subCols: ["Enabled"], 
                      getData: (itemName, key) => ({ Enabled: userData[itemName].sys[key] }) 
                  },
                  { 
                      title: "Object Permissions", 
                      keys: sortedObjects, 
                      subCols: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"], 
                      getData: (itemName, key) => userData[itemName].objects[key] || {}
                  },
                  { 
                      title: "Group Membership", 
                      keys: sortedGroups, 
                      subCols: ["Member"], 
                      getData: (itemName, key) => ({ Member: userData[itemName].groups[key] }) 
                  }
              ]
          }
      });
  }

    async compareProfiles(profileItems) {
      const { model } = this.props;
      const profileNames = profileItems.map(p => p.Name);
      const profileIds = profileItems.map(p => p.Id);
      const results = {}; 
      
      // 1. Dynamic System Permissions Discovery
      // Describe PermissionSet to get all "Permissions..." fields
      const permSetDescribe = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/sobjects/PermissionSet/describe"));
      const sysPermFields = permSetDescribe.fields
          .filter(f => f.name.startsWith("Permissions") && f.type === "boolean")
          .map(f => f.name);
      
      const sysSelect = sysPermFields.join(", ");

      const profileIdsString = profileIds.map(id => `'${id}'`).join(",");
      const profileNamesString = profileNames.map(name => `'${name.replace(/'/g, "\\'")}'`).join(",");

      // Initialize results structure
      profileNames.forEach(name => {
          results[name] = { objects: {}, fields: {}, sys: {}, layouts: {}, apex: {}, vf: {}, apps: {}, tabs: {}, login: {} };
      });

      // 2. Fetch Data in Parallel where possible (or sequential for clarity)
      
      // A. Object Permissions
      const objQuery = `SELECT Parent.Profile.Name, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE Parent.Profile.Name IN (${profileNamesString}) ORDER BY SobjectType`;
      const objRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(objQuery)));
      
      if (objRes && objRes.records) {
          objRes.records.forEach(p => {
              const pName = p.Parent?.Profile?.Name;
              if (results[pName]) {
                  results[pName].objects[p.SobjectType] = {
                      Read: p.PermissionsRead,
                      Create: p.PermissionsCreate,
                      Edit: p.PermissionsEdit,
                      Delete: p.PermissionsDelete,
                      ViewAll: p.PermissionsViewAllRecords,
                      ModifyAll: p.PermissionsModifyAllRecords
                  };
              }
          });
      }

      // B. Field Permissions
      // Querying all fields for multiple profiles might be huge. If too huge, might need chunking or per-profile.
      const fieldQuery = `SELECT Parent.Profile.Name, Field, SObjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE Parent.Profile.Name IN (${profileNamesString})`;
      const fieldRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(fieldQuery)));
      
       if (fieldRes && fieldRes.records) {
          fieldRes.records.forEach(p => {
              const pName = p.Parent?.Profile?.Name;
              if (results[pName]) {
                  results[pName].fields[p.Field] = {
                      Read: p.PermissionsRead,
                      Edit: p.PermissionsEdit
                  };
              }
          });
      }

      // C. System Permissions
      const sysQuery = `SELECT Profile.Name, ${sysSelect} FROM PermissionSet WHERE Profile.Name IN (${profileNamesString})`;
      const sysRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(sysQuery)));
      
      if (sysRes && sysRes.records) {
          sysRes.records.forEach(r => {
              const pName = r.Profile?.Name;
              if (results[pName]) {
                   sysPermFields.forEach(field => {
                       const shortKey = field.replace("Permissions", "");
                       results[pName].sys[shortKey] = r[field];
                   });
              }
          });
      }

      // D. Setup Entity Access (Apex, VF, Apps)
      const setupQuery = `SELECT SetupEntityId, SetupEntityType, SetupEntity.Name, Parent.Profile.Name FROM SetupEntityAccess WHERE Parent.Profile.Name IN (${profileNamesString}) AND SetupEntityType IN ('ApexClass', 'ApexPage', 'TabSet')`;
      const setupRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(setupQuery)));
      
      if (setupRes && setupRes.records) {
          setupRes.records.forEach(r => {
              const pName = r.Parent?.Profile?.Name;
              const entityName = r.SetupEntity?.Name; 
              if (results[pName] && entityName) {
                  if (r.SetupEntityType === 'ApexClass') results[pName].apex[entityName] = true;
                  if (r.SetupEntityType === 'ApexPage') results[pName].vf[entityName] = true;
                  if (r.SetupEntityType === 'TabSet') results[pName].apps[entityName] = true;
              }
          });
      }

      // E. Layout Assignments (Tooling API)
      const layoutQuery = `SELECT Layout.Name, Layout.TableEnumOrId, RecordType.Name, RecordType.DeveloperName, Profile.Name, ProfileId FROM ProfileLayout WHERE ProfileId IN (${profileIdsString})`;
      const layoutRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/tooling/query/?q=" + encodeURIComponent(layoutQuery)));
    
      if (layoutRes && layoutRes.records) {
          layoutRes.records.forEach(r => {
              const pName = r.Profile ? r.Profile.Name : profileItems.find(p => p.Id === r.ProfileId)?.Name; 
              if (results[pName]) {
                  const objectName = r.Layout.TableEnumOrId;
                  const layoutName = r.Layout.Name;
                  const rtName = r.RecordType ? r.RecordType.Name : "Master"; 
                  const key = `${objectName} (${rtName})`;
                  results[pName].layouts[key] = layoutName;
              }
          });
      }

      // F. Tab Settings
      try {
          const tabQuery = `SELECT Name, Visibility, Parent.Profile.Name FROM PermissionSetTabSetting WHERE Parent.Profile.Name IN (${profileNamesString})`;
           const tabRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(tabQuery)));
           if (tabRes && tabRes.records) {
               tabRes.records.forEach(r => {
                   const pName = r.Parent?.Profile?.Name;
                   if (results[pName]) {
                       results[pName].tabs[r.Name] = r.Visibility;
                   }
               });
           }
      } catch (e) {
          console.warn("PermissionSetTabSetting query failed: " + e.message);
      }

      // G. Login Restrictions (IP Ranges & Login Hours)
      try {
          // 1. IP Ranges
          const ipQuery = `SELECT ProfileId, StartAddress, EndAddress, Description FROM ProfileLoginIpRange WHERE ProfileId IN (${profileIdsString})`;
          const ipRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(ipQuery)));
          if (ipRes && ipRes.records) {
              ipRes.records.forEach(r => {
                  const pName = profileItems.find(p => p.Id === r.ProfileId)?.Name;
                  if (results[pName]) {
                      const range = `${r.StartAddress} - ${r.EndAddress}`;
                      results[pName].login[`IP Range: ${range}`] = r.Description || "Active";
                  }
              });
          }

          // 2. Login Hours
          // Note: LoginHours is a complex field on Profile.
          const hoursQuery = `SELECT Id, Name, LoginHours FROM Profile WHERE Id IN (${profileIdsString})`;
          const hoursRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(hoursQuery)));
           if (hoursRes && hoursRes.records) {
              hoursRes.records.forEach(r => {
                   const pName = r.Name;
                   if (results[pName] && r.LoginHours) {
                       // Format LoginHours object
                       // It has keys like 'MondayStart', 'MondayEnd', etc. in minutes from midnight?
                       // Or simple string if query returns simplified. Usually it returns object.
                       // Let's iterate keys.
                       Object.keys(r.LoginHours).forEach(dayKey => {
                           if (dayKey !== "attributes") {
                                results[pName].login[`Hours: ${dayKey}`] = r.LoginHours[dayKey];
                           }
                       });
                   }
              });
          }
      } catch (e) {
          console.warn("Login restrictions query failed: " + e.message);
      }

      // Aggregate for View - Reordered as requested
      const createSortedKeys = (category) => {
          const s = new Set();
          Object.values(results).forEach(d => Object.keys(d[category]).forEach(k => s.add(k)));
          return Array.from(s).sort();
      };

      const sortedSys = createSortedKeys("sys");
      const sortedVf = createSortedKeys("vf");
      const sortedObjects = createSortedKeys("objects");
      const sortedTabs = createSortedKeys("tabs");
      const sortedFields = createSortedKeys("fields");
      const sortedApps = createSortedKeys("apps");
      const sortedLayouts = createSortedKeys("layouts");
      const sortedLogin = createSortedKeys("login");
      // sortedApex excluded as per user request (or if they forgot, I'll exclude to match "remove Q" list)

      this.setState({
          comparisonData: {
              type: "structured_profile_transposed", // Reuse existing table renderer
              rows: profileNames,
              sections: [
                 { 
                      title: "System Permissions", 
                      keys: sortedSys, 
                      subCols: ["Enabled"],
                      getData: (itemName, key) => ({ Enabled: results[itemName]?.sys[key] })
                  },
                  {
                      title: "Visualforce Page Access",
                      keys: sortedVf,
                      subCols: ["Access"],
                      getData: (itemName, key) => ({ Access: results[itemName]?.vf[key] })
                  },
                  { 
                      title: "Object Permissions", 
                      keys: sortedObjects, 
                      subCols: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"],
                      getData: (itemName, key) => results[itemName]?.objects[key] || {}
                  },
                  {
                      title: "Tab Settings",
                      keys: sortedTabs,
                      subCols: ["Visibility"],
                      getData: (itemName, key) => ({ Visibility: results[itemName]?.tabs[key] })
                  },
                  { 
                      title: "Field-Level Security", 
                      keys: sortedFields, 
                      subCols: ["Read", "Edit"],
                      getData: (itemName, key) => results[itemName]?.fields[key] || {}
                  },
                  {
                      title: "App Settings",
                      keys: sortedApps,
                      subCols: ["Visible"],
                      getData: (itemName, key) => ({ Visible: results[itemName]?.apps[key] })
                  },
                  {
                      title: "Page Layout Assignment",
                      keys: sortedLayouts,
                      subCols: ["Layout"],
                      getData: (itemName, key) => ({ Layout: results[itemName]?.layouts[key] })
                  },
                  {
                      title: "Login Restriction",
                      keys: sortedLogin,
                      subCols: ["Value"],
                      getData: (itemName, key) => ({ Value: results[itemName]?.login[key] })
                  }
              ]
          }
      });
  }

  async comparePermSets(permSetItems) {
      // Re-use logic similar to Profiles but query by ParentId
      const psIds = permSetItems.map(p => p.Id);
      const psNames = permSetItems.map(p => p.Label || p.Name); // Use Label for display
      const psMap = {};
      permSetItems.forEach(p => psMap[p.Id] = p.Label || p.Name);

      const rawData = await this.fetchPermissionsForPermSets(psIds);
      
      const results = {};
      psIds.forEach(id => {
          results[psMap[id]] = rawData[id];
      });

      this.setState({
          comparisonData: this.buildComparisonDataResult(psNames, results)
      });
  }

  async comparePermSetGroups(groupItems) {
      const { model } = this.props;
      const groupIds = groupItems.map(g => g.Id);
      const groupNames = groupItems.map(g => g.MasterLabel || g.DeveloperName);
      const groupMap = {};
      groupItems.forEach(g => groupMap[g.Id] = g.MasterLabel || g.DeveloperName);

      // 1. Resolve Group Components
      const compQuery = `SELECT PermissionSetGroupId, PermissionSetId FROM PermissionSetGroupComponent WHERE PermissionSetGroupId IN (${groupIds.map(id => `'${id}'`).join(",")})`;
      const compRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(compQuery)));
      
      const groupComponents = {}; // GroupId -> [PsId, PsId]
      const allPsIds = new Set();
      
      if (compRes && compRes.records) {
          compRes.records.forEach(r => {
              if (!groupComponents[r.PermissionSetGroupId]) groupComponents[r.PermissionSetGroupId] = [];
              groupComponents[r.PermissionSetGroupId].push(r.PermissionSetId);
              allPsIds.add(r.PermissionSetId);
          });
      }

      // 2. Fetch all component permissions
      const psData = await this.fetchPermissionsForPermSets(Array.from(allPsIds));

      // 3. Aggregate (OR Logic)
      const results = {};
      groupIds.forEach(gid => {
          const name = groupMap[gid];
          const components = groupComponents[gid] || [];
          
          results[name] = { objects: {}, fields: {}, sys: {}, apex: {}, vf: {}, apps: {}, tabs: {} };
          
          components.forEach(psId => {
              const ps = psData[psId];
              if (!ps) return;
              
              // Helper to OR boolean/permissions
              const mergeBool = (target, source, key) => { target[key] = (target[key] === "true" || target[key] === true || source[key] === "true" || source[key] === true); };
              const mergeObjPerm = (target, source) => {
                  target.Read = target.Read || source.Read;
                  target.Create = target.Create || source.Create;
                  target.Edit = target.Edit || source.Edit;
                  target.Delete = target.Delete || source.Delete;
                  target.ViewAll = target.ViewAll || source.ViewAll;
                  target.ModifyAll = target.ModifyAll || source.ModifyAll;
              };

              // Merge System
              Object.keys(ps.sys).forEach(k => {
                   results[name].sys[k] = (results[name].sys[k] === "true" || results[name].sys[k] === true || ps.sys[k] === "true" || ps.sys[k] === true) ? "true" : "false"; // Keep consistent string/bool
              });
              
              // Merge Objects
              Object.keys(ps.objects).forEach(k => {
                  if (!results[name].objects[k]) results[name].objects[k] = { Read: false, Create: false, Edit: false, Delete: false, ViewAll: false, ModifyAll: false };
                  mergeObjPerm(results[name].objects[k], ps.objects[k]);
              });

              // Merge Fields
              Object.keys(ps.fields).forEach(k => {
                  if (!results[name].fields[k]) results[name].fields[k] = { Read: false, Edit: false };
                  results[name].fields[k].Read = results[name].fields[k].Read || ps.fields[k].Read;
                  results[name].fields[k].Edit = results[name].fields[k].Edit || ps.fields[k].Edit;
              });

              // Merge Apex/VF/Apps/Tabs (Existence = Access)
              Object.keys(ps.apex).forEach(k => results[name].apex[k] = true);
              Object.keys(ps.vf).forEach(k => results[name].vf[k] = true);
              Object.keys(ps.apps).forEach(k => results[name].apps[k] = true);
              Object.keys(ps.tabs).forEach(k => {
                  // Visibility logic is trickier: "Visible" > "Available" > "None"
                  // Simple OR: if any is Visible, it's Visible.
                  const val = ps.tabs[k];
                  const current = results[name].tabs[k];
                  if (val === "Visible" || current === "Visible") results[name].tabs[k] = "Visible";
                  else if (val === "Available" || current === "Available") results[name].tabs[k] = "Available";
                  else results[name].tabs[k] = val; // None
              });
          });
      });

      this.setState({
          comparisonData: this.buildComparisonDataResult(groupNames, results)
      });
  }

  async fetchPermissionsForPermSets(psIds) {
      if (psIds.length === 0) return {};
      const { model } = this.props;
      const results = {}; // PsId -> Data
      psIds.forEach(id => results[id] = { objects: {}, fields: {}, sys: {}, apex: {}, vf: {}, apps: {}, tabs: {} });
      const idsString = psIds.map(id => `'${id}'`).join(",");

      // Parallel Fetch
      const promises = [];

      // A. Objects
      promises.push(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(`SELECT ParentId, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId IN (${idsString}) ORDER BY SobjectType`))
        .then(res => res.records.forEach(p => {
             if (results[p.ParentId]) results[p.ParentId].objects[p.SobjectType] = { Read: p.PermissionsRead, Create: p.PermissionsCreate, Edit: p.PermissionsEdit, Delete: p.PermissionsDelete, ViewAll: p.PermissionsViewAllRecords, ModifyAll: p.PermissionsModifyAllRecords };
        })));

      // B. Fields
      promises.push(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(`SELECT ParentId, Field, SObjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (${idsString})`))
        .then(res => res.records.forEach(p => {
             if (results[p.ParentId]) results[p.ParentId].fields[p.Field] = { Read: p.PermissionsRead, Edit: p.PermissionsEdit };
        })));

      // C. System (from PermissionSet object itself)
      // First describe to get fields
      const permSetDescribe = await sfConn.rest("/services/data/v" + apiVersion + "/sobjects/PermissionSet/describe");
      const sysPermFields = permSetDescribe.fields.filter(f => f.name.startsWith("Permissions") && f.type === "boolean").map(f => f.name);
      
      // Batch Sys Query if needed?
      const sysQuery = `SELECT Id, ${sysPermFields.join(", ")} FROM PermissionSet WHERE Id IN (${idsString})`;
      promises.push(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(sysQuery))
        .then(res => res.records.forEach(r => {
             if (results[r.Id]) {
                 sysPermFields.forEach(f => {
                     if (r[f]) results[r.Id].sys[f.replace("Permissions", "")] = "true";
                 });
             }
        })));
      
      // D. Setup Entity Access
      promises.push(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(`SELECT ParentId, SetupEntityId, SetupEntityType, SetupEntity.Name FROM SetupEntityAccess WHERE ParentId IN (${idsString}) AND SetupEntityType IN ('ApexClass', 'ApexPage', 'TabSet')`))
        .then(res => res.records.forEach(r => {
             if (results[r.ParentId] && r.SetupEntity?.Name) {
                 if (r.SetupEntityType === 'ApexClass') results[r.ParentId].apex[r.SetupEntity.Name] = true;
                 if (r.SetupEntityType === 'ApexPage') results[r.ParentId].vf[r.SetupEntity.Name] = true;
                 if (r.SetupEntityType === 'TabSet') results[r.ParentId].apps[r.SetupEntity.Name] = true;
             }
        })));

      // E. Tab Settings
      try {
          promises.push(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(`SELECT ParentId, Name, Visibility FROM PermissionSetTabSetting WHERE ParentId IN (${idsString})`))
            .then(res => res.records.forEach(r => {
                 if (results[r.ParentId]) results[r.ParentId].tabs[r.Name] = r.Visibility;
            })));
      } catch (e) { /* Ignore */ }

      await model.spinFor(Promise.all(promises));
      return results;
  }

  buildComparisonDataResult(rowNames, results) {
      const createSortedKeys = (category) => {
          const s = new Set();
          Object.values(results).forEach(d => d[category] ? Object.keys(d[category]).forEach(k => s.add(k)) : null);
          return Array.from(s).sort();
      };

      const sortedObjects = createSortedKeys("objects");
      const sortedFields = createSortedKeys("fields");
      const sortedSys = createSortedKeys("sys");
      const sortedApex = createSortedKeys("apex");
      const sortedVf = createSortedKeys("vf");
      const sortedApps = createSortedKeys("apps");
      const sortedTabs = createSortedKeys("tabs");

      return {
              type: "structured_profile_transposed",
              rows: rowNames,
              sections: [
                 { title: "System Permissions", keys: sortedSys, subCols: ["Enabled"], getData: (itemName, key) => ({ Enabled: results[itemName]?.sys[key] }) },
                 { title: "Object Permissions", keys: sortedObjects, subCols: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"], getData: (itemName, key) => results[itemName]?.objects[key] || {} },
                 { title: "Field Permissions", keys: sortedFields, subCols: ["Read", "Edit"], getData: (itemName, key) => results[itemName]?.fields[key] || {} },
                 { title: "Apex Class Access", keys: sortedApex, subCols: ["Access"], getData: (itemName, key) => ({ Access: results[itemName]?.apex[key] }) },
                 { title: "Visualforce Page Access", keys: sortedVf, subCols: ["Access"], getData: (itemName, key) => ({ Access: results[itemName]?.vf[key] }) },
                 { title: "App Visibility", keys: sortedApps, subCols: ["Visible"], getData: (itemName, key) => ({ Visible: results[itemName]?.apps[key] }) },
                 { title: "Tab Settings", keys: sortedTabs, subCols: ["Visibility"], getData: (itemName, key) => ({ Visibility: results[itemName]?.tabs[key] }) }
              ]
      };
  }

  exportToCSV() {
      const { comparisonData } = this.state;
      if (!comparisonData || !comparisonData.rows) return;
      
      let csv = "Section,Item,Sub-Item," + comparisonData.rows.map(r => `"${r}"`).join(",") + "\n";
      
      comparisonData.sections.forEach(section => {
          section.keys.forEach(key => {
              section.subCols.forEach(sub => {
                  let row = `"${section.title}","${key}","${sub}"`;
                  comparisonData.rows.forEach(rName => {
                      const d = section.getData(rName, key);
                      let val = d ? d[sub] : "";
                      if (val === true) val = "true";
                      if (val === false) val = "false";
                      if (val === undefined) val = "";
                      row += `,"${val}"`;
                  });
                  csv += row + "\n";
              });
          });
      });
      
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparison_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
  }

  processProfileComparison(itemNames, allMetadata) {
      // We want to pivot:
      // Rows: Profile A, Profile B
      // Columns: Object.Read, Object.Edit, Field.Name.Read, etc.
      
      // Let's create a "Master List" of all unique permissions found across ALL items to define the columns
      // But we still want to group them (Objects, Fields, Systems) for readability.
      
      // Data Structure Idea:
      // sections: [
      //   {
      //      title: "Account Object Permissions",
      //      columns: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"],
      //      rows: [
      //         { itemName: "Profile A", data: { "Read": true, "Create": false ... } },
      //         { itemName: "Profile B", data: { ... } }
      //      ]
      //   }
      // ]
      
      // Wait, "Account Object Permissions" is too granular if we have 100 objects.
      // Better:
      // Section: "Object Permissions"
      // Table:
      //   Top Header: Account | Contact | ...
      //   Sub Header: R C E D | R C E D | ...
      //   Row 1 (Profile A): v v x v | v v v v 
      
      // Implementation:
      
      const allObjects = new Set();
      const allFields = new Set();
      const allSysPerms = new Set();
      
      const itemData = {}; // Map<ProfileName, { objects: {}, fields: {}, sys: {} }>

      itemNames.forEach(name => {
          itemData[name] = { objects: {}, fields: {}, sys: {} };
          
          const meta = allMetadata.find(m => m && (m.fullName === name || decodeURIComponent(m.fullName) === name));
          if (!meta) return;

          // Objects
          if (meta.objectPermissions) {
              const ops = Array.isArray(meta.objectPermissions) ? meta.objectPermissions : [meta.objectPermissions];
              ops.forEach(op => {
                  allObjects.add(op.object);
                  itemData[name].objects[op.object] = {
                      Read: op.allowRead,
                      Create: op.allowCreate,
                      Edit: op.allowEdit,
                      Delete: op.allowDelete,
                      ViewAll: op.viewAllRecords,
                      ModifyAll: op.modifyAllRecords
                  };
              });
          }

          // Fields
          if (meta.fieldPermissions) {
              const fps = Array.isArray(meta.fieldPermissions) ? meta.fieldPermissions : [meta.fieldPermissions];
              fps.forEach(fp => {
                  allFields.add(fp.field);
                  itemData[name].fields[fp.field] = {
                      Read: fp.readable,
                      Edit: fp.editable
                  };
              });
          }

          // User (System) Permissions
          if (meta.userPermissions) {
              const ups = Array.isArray(meta.userPermissions) ? meta.userPermissions : [meta.userPermissions];
              ups.forEach(up => {
                  allSysPerms.add(up.name);
                  itemData[name].sys[up.name] = up.enabled;
              });
          }
      });
      
      const sortedObjects = Array.from(allObjects).sort();
      const sortedFields = Array.from(allFields).sort();
      const sortedSys = Array.from(allSysPerms).sort();

      this.setState({
          comparisonData: {
              type: "structured_profile_transposed", // New type
              rows: itemNames, // The Profiles/Users are the rows now
              sections: [
                  { 
                      title: "Object Permissions", 
                      keys: sortedObjects, 
                      subCols: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"],
                      // Accessor function to get data for (itemName, key)
                      getData: (itemName, key) => itemData[itemName].objects[key] || {}
                  },
                  { 
                      title: "Field Permissions", 
                      keys: sortedFields, 
                      subCols: ["Read", "Edit"],
                      getData: (itemName, key) => itemData[itemName].fields[key] || {}
                  },
                  { 
                      title: "System Permissions", 
                      keys: sortedSys, 
                      subCols: ["Enabled"],
                      getData: (itemName, key) => ({ Enabled: itemData[itemName].sys[key] })
                  }
              ]
          }
      });
  }
  
    renderComparisonTable() {
    const { comparisonData, activeSectionTitle, tableFilter } = this.state;
    if (!comparisonData) return null;

    if (comparisonData.type === "structured_profile_transposed") {
        const sections = comparisonData.sections || [];
        if (sections.length === 0) return null;

        // Default to first section if no active section selected
        const currentTitle = activeSectionTitle || sections[0].title;
        const activeSection = sections.find(s => s.title === currentTitle) || sections[0];

        // Styles matching the user's design image
        const sectionButtonStyle = (isActive) => ({
            backgroundColor: isActive ? "#065ca1" : "#0f6ecd", // Darker blue if active
            color: "white",
            border: "none",
            borderRadius: "4px",
            padding: "6px 16px",
            marginRight: "8px",
            marginBottom: "8px",
            fontSize: "0.85rem",
            fontWeight: "500",
            display: "inline-flex",
            alignItems: "center",
            cursor: "pointer",
            transition: "background-color 0.1s",
            boxShadow: isActive ? "inset 0 2px 4px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.1)"
        });

        const iconStyle = {
            width: "14px",
            height: "14px",
            marginRight: "8px",
            fill: "white"
        };

        const actionBtnStyle = (bgColor) => ({
             backgroundColor: bgColor,
             color: "white",
             border: "none",
             borderRadius: "4px",
             padding: "0 16px",
             lineHeight: "32px",
             fontSize: "0.85rem",
             fontWeight: "500",
             cursor: "pointer",
             display: "inline-flex",
             alignItems: "center",
             marginLeft: "8px"
        });

        // Search Icon SVG
        const searchIcon = h("svg", { style: iconStyle, viewBox: "0 0 52 52" }, 
            h("path", { d: "M49.62 45.27L36.22 32a20.18 20.18 0 0 0 4.1-12.35C40.32 8.84 31.42 0 20.42 0S.52 8.84.52 19.66c0 10.83 8.9 19.67 19.9 19.67a20.5 20.5 0 0 0 11.23-3.32l13.56 13.43a2.6 2.6 0 0 0 3.67 0l.75-.72a2.53 2.53 0 0 0-.01-3.45zM20.42 34.16c-8.15 0-14.73-6.52-14.73-14.5S12.27 5.16 20.42 5.16s14.73 6.52 14.73 14.5-6.57 14.5-14.73 14.5z", fill: "currentColor" })
        );

        return h("div", { className: "slds-card slds-m-top_medium", style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "200px" } },
            // Top Section: Navigation Buttons (Blue Chips)
            h("div", { className: "slds-p-around_small", style: { borderBottom: "1px solid #dddbda", backgroundColor: "#fff" } },
                h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start" } },
                    sections.map(s => 
                        h("button", { 
                            key: s.title,
                            style: sectionButtonStyle(currentTitle === s.title),
                            onClick: () => this.setState({ activeSectionTitle: s.title, tableFilter: "" })
                        }, 
                           searchIcon,
                           s.title
                        )
                    )
                )
            ),
            
            // Filter & Action Bar
            h("div", { className: "slds-p-horizontal_small slds-p-vertical_x-small slds-border_bottom", style: { display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff" } },
               // Left: Filter Input
               h("div", { style: { display: "flex", alignItems: "center", flex: 1, maxWidth: "500px" } },
                   h("span", { style: { fontWeight: "bold", marginRight: "12px", fontSize: "0.9rem" } }, "Filter"),
                   h("div", { className: "slds-form-element__control slds-input-has-icon slds-input-has-icon_right", style: { flex: 1 } },
                        h("input", { 
                            type: "text", 
                            className: "slds-input", 
                            style: { borderRadius: "4px", height: "34px" },
                            value: tableFilter || "",
                            onChange: (e) => this.setState({ tableFilter: e.target.value })
                        }),
                        tableFilter && h("button", { 
                            className: "slds-button slds-button_icon slds-input__icon slds-input__icon_right",
                            onClick: () => this.setState({ tableFilter: "" })
                        }, 
                           h("svg", { className: "slds-button__icon slds-icon-text-light", style: { width: "16px", height: "16px" } }, h("use", { xlinkHref: "symbols.svg#close" }))
                        )
                   ),
                   // Placeholder circle from image (if needed, otherwise skip)
                   h("div", { style: { width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#e0e0e0", marginLeft: "12px" } })
               ),

               // Right: Actions
               h("div", { style: { display: "flex", alignItems: "center" } },
                   h("button", { style: actionBtnStyle("#00a79d") }, 
                       h("svg", { className: "slds-button__icon slds-button__icon_left", "aria-hidden": "true", style: { fill: "white" } }, h("use", { xlinkHref: "symbols.svg#filterList" })),
                       "Profile Filter"
                   ),
                   h("button", { style: actionBtnStyle("#8ee0d6"), onClick: () => alert("XLSX Export not implemented yet") },
                       h("svg", { className: "slds-button__icon slds-button__icon_left", "aria-hidden": "true", style: { fill: "white" } }, h("use", { xlinkHref: "symbols.svg#download" })),
                       "Export XLSX"
                   ),
                   h("button", { style: actionBtnStyle("#8ee0d6"), onClick: () => this.exportToCSV() }, 
                       h("svg", { className: "slds-button__icon slds-button__icon_left", "aria-hidden": "true", style: { fill: "white" } }, h("use", { xlinkHref: "symbols.svg#download" })),
                       "Export CSV"
                   ),
                   h("button", { 
                       className: "slds-button",
                       title: "Refresh",
                       onClick: this.onSimpleCompare,
                       style: { 
                           width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#8ee0d6", border: "none", 
                           display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "8px", cursor: "pointer" 
                       }
                   }, h("span", { style: { fontSize: "1.2rem", lineHeight: 1, color: "white", fontWeight: "bold" } }, "↻"))
               )
            ),

            // Table Content
            h("div", { className: "slds-card__body slds-card__body_inner", style: { overflow: "auto", flex: 1, padding: 0 } },
                this.renderTransposedTable(activeSection, comparisonData.rows, tableFilter || "")
            )
        );
    } else if (comparisonData.type === "structured_profile") { 
          return this.renderStructuredSection(comparisonData.sections[0], comparisonData.columns, 0); 
    } else {
        return this.renderGenericTable(comparisonData);
    }
  }

  renderTransposedTable(section, rowItems, filter) {
    if (!section.keys || section.keys.length === 0) return h("div", { className: "slds-p-around_medium" }, "No data available for this section.");

    // Filter Logic
    const filteredKeys = section.keys.filter(k => k.toLowerCase().includes(filter.toLowerCase()));

    if (filteredKeys.length === 0) return h("div", { className: "slds-p-around_medium" }, "No matching items found.");

    // Function to format value
    const formatVal = (val) => {
        if (val === true || val === "true") return "Yes";
        if (val === false || val === "false") return "";
        return val || "";
    };

    return h("table", { className: "slds-table slds-table_bordered slds-table_col-bordered slds-table_fixed-layout slds-table_resizable-cols", style: { width: "max-content", minWidth: "100%", borderCollapse: "separate" } },
        h("thead", {},
            h("tr", {}, 
                // Sticky Header for First Column (Field Label)
                h("th", { style: { width: "250px", position: "sticky", top: 0, left: 0, zIndex: 10, backgroundColor: "#f3f2f2", borderBottom: "1px solid #dddbda", boxShadow: "2px 0 5px -2px rgba(0,0,0,0.1)" } }, 
                    h("div", { className: "slds-truncate", title: "Field Label" }, "Field Label")
                ),
                // Sticky Header for Second Column (API Name)
                h("th", { style: { width: "200px", position: "sticky", top: 0, left: "250px", zIndex: 10, backgroundColor: "#f3f2f2", borderBottom: "1px solid #dddbda", boxShadow: "2px 0 5px -2px rgba(0,0,0,0.1)" } }, 
                   h("div", { className: "slds-truncate", title: "API Name" }, "API Name")
                ),
                 // Profile/User Headers
                rowItems.map(item => 
                    h("th", { key: item, style: { width: "150px", position: "sticky", top: 0, backgroundColor: "#f3f2f2", borderBottom: "1px solid #dddbda", textAlign: "center" } },
                        h("div", { className: "slds-truncate", title: item }, item)
                    )
                )
            )
        ),
        h("tbody", {},
            filteredKeys.map(key => {
                const subCols = section.subCols || ["Value"];
                
                return subCols.map(subCol => {
                    // Logic to display cleaner labels
                    const isSystem = section.title === "User Permissions" || section.title === "Apex Class Access" || section.title === "Visualforce Page Access";
                    const isObject = section.title === "Object Permissions";

                    let rowLabel = key;
                    let apiName = key;
                    
                    if (isObject) {
                        rowLabel = `${key} [${subCol}]`;
                        apiName = `${key}.${subCol}`; 
                    } else if (!isSystem && subCols.length > 1) {
                         rowLabel = `${key} ${subCol}`;
                         apiName = `${key}.${subCol}`;
                    }

                    return h("tr", { key: rowLabel },
                        h("td", { style: { position: "sticky", left: 0, backgroundColor: "white", zIndex: 1, borderRight: "1px solid #dddbda" } }, 
                            h("div", { className: "slds-truncate", title: rowLabel }, rowLabel)
                        ),
                        h("td", { style: { position: "sticky", left: "250px", backgroundColor: "white", zIndex: 1, borderRight: "1px solid #dddbda" } }, 
                            h("div", { className: "slds-truncate", title: apiName }, apiName)
                        ),
                        rowItems.map(itemName => {
                             const data = section.getData(itemName, key);
                             let val = "";
                             if (data && typeof data === 'object') {
                                 val = data[subCol];
                             } else {
                                 val = data;
                             }
                             return h("td", { key: itemName, className: "slds-text-align_center" }, formatVal(val));
                        })
                    );
                });
            })
        )
    );
  }

  renderPicker() {
      const { selectedCategory, availableItems, selectedItems, isLoading, filterText } = this.state;
      if (!selectedCategory) return h("div", { className: "slds-p-around_medium" }, "Select a category to start.");
      
      const filteredItems = availableItems.filter(i => (i.Label || i.Name).toLowerCase().includes(filterText.toLowerCase()));

      return h("div", { className: "slds-p-around_medium", style: { flex: "0 0 auto", display: "flex", flexDirection: "column", maxHeight: "50%" } },
          h("h1", { className: "slds-text-heading_medium slds-m-bottom_small" }, `Compare ${selectedCategory.label}`),
          h("p", { className: "slds-text-body_regular slds-m-bottom_medium" }, selectedCategory.description),
          
          h("div", { className: "slds-form-element slds-m-bottom_small" },
              h("div", { className: "slds-form-element__control slds-input-has-icon slds-input-has-icon_right" },
                  h("input", { 
                      type: "text", 
                      className: "slds-input", 
                      placeholder: `Filter ${selectedCategory.label}...`,
                      value: filterText,
                      onChange: (e) => this.setState({ filterText: e.target.value })
                   }),
                   filterText && h("button", { 
                       className: "slds-button slds-button_icon slds-input__icon slds-input__icon_right", 
                       title: "Clear",
                       onClick: () => this.setState({ filterText: "" })
                   }, h("svg", { className: "slds-button__icon slds-icon-text-light" }, h("use", { xlinkHref: "symbols.svg#close" })))
              )
          ),

          selectedCategory.id !== "audit" && h("div", { 
              className: "slds-scrollable_y custom-scroll", 
              style: { 
                  maxHeight: "300px", 
                  border: "1px solid #dddbda", 
                  borderRadius: "0.25rem", 
                  backgroundColor: "#f3f2f2", /* Light background for contrast with white chips */
                  padding: "0.5rem",
                  display: "flex",
                  flexWrap: "wrap",
                  alignContent: "flex-start",
                  gap: "6px"
              } 
          },
              filteredItems.length === 0 
                ? h("div", { className: "slds-text-color_weak slds-p-horizontal_small" }, "No items found")
                : filteredItems.map(item => {
                     const isSelected = !!selectedItems.find(i => i.Id === item.Id);
                     return h("button", { 
                         key: item.Id, 
                         className: "slds-button",
                         title: item.Label || item.Name,
                         onClick: () => this.onItemSelect({ target: { checked: !isSelected } }, item), // Reuse existing handler logic
                         style: { 
                             display: "inline-flex", 
                             alignItems: "center", 
                             border: `1px solid ${isSelected ? "#0070d2" : "#dddbda"}`, 
                             borderRadius: "1rem", 
                             padding: "4px 10px", 
                             backgroundColor: isSelected ? "#0070d2" : "white",
                             color: isSelected ? "white" : "#080707",
                             cursor: "pointer", 
                             fontSize: "0.8125rem",
                             lineHeight: "1.2",
                             boxShadow: isSelected ? "0 2px 2px 0 rgba(0,0,0,0.1)" : "none",
                             transition: "all 0.1s"
                         }
                     },
                         h("span", { className: `slds-icon_containerBuilder slds-m-right_xx-small`, style: { transform: "scale(0.8)" } },
                           // Use category icon or generic. White icon if selected.
                           h("svg", { className: "slds-icon slds-icon_x-small", style: { fill: isSelected ? "white" : "currentColor" }, "aria-hidden": "true" }, 
                               h("use", { xlinkHref: `symbols.svg#${selectedCategory.icon || "custom_apps"}` })
                           )
                         ),
                         h("span", { className: "slds-truncate", style: { maxWidth: "200px" } }, item.Label || item.Name)
                     );
                 })
          ),
          
          // Helper text or count
          selectedItems.length > 0 && h("div", { className: "slds-m-top_x-small slds-text-color_weak slds-text-body_small" }, 
              `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} selected`
          ),

          h("div", { className: "slds-m-top_medium" },
              h("button", { 
                  className: "slds-button slds-button_brand", 
                  disabled: (selectedCategory.id !== "audit" && selectedItems.length < 1) || isLoading,
                  onClick: this.onSimpleCompare
              }, isLoading ? "Processing..." : (selectedCategory.id === "audit" ? "View Audit Log" : "Compare Selected"))
          )
      );
  }



  renderHeaderSelector() {
    const { selectedCategory } = this.state;
    const groups = [...new Set(categories.map(c => c.group))];

    return h("div", { className: "slds-builder-header__utilities-item", key: "header-selector", style: { borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: "12px", marginRight: "12px", display: "flex", alignItems: "center" } },
        h("div", { className: "slds-form-element" },
            h("div", { className: "slds-form-element__control" },
                h("div", { className: "slds-select_container", style: { minWidth: "200px" } },
                    h("select", {
                        className: "slds-select",
                        value: selectedCategory ? selectedCategory.id : "",
                        onChange: (e) => {
                            const cat = categories.find(c => c.id === e.target.value);
                            this.onCategorySelect(cat);
                        },
                        style: { height: "30px", fontSize: "0.8125rem", padding: "0 1rem 0 0.75rem", color: "black" }
                    },
                        !selectedCategory && h("option", { value: "", disabled: true }, "Choose category..."),
                        groups.map(group => 
                            h("optgroup", { label: group, key: group },
                                categories.filter(c => c.group === group).map(c => 
                                    h("option", { key: c.id, value: c.id }, c.label)
                                )
                            )
                        )
                    )
                )
            )
        )
    );
  }

  render() {
    let {model} = this.props;
    const { selectedCategory } = this.state;

    return h("div", {},
      h(PageHeader, {
        pageTitle: "Org Comparison",
        orgName: model.orgName,
        sfLink: model.sfLink,
        sfHost: model.sfHost,
        spinnerCount: model.spinnerCount,
        ...model.userInfoModel.getProps(),
        utilityItems: [
           this.renderHeaderSelector()
        ]
      }),
      h("div", {
        className: "slds-m-top_xx-large slds-p-around_medium",
        style: {
          height: "calc(100vh - 4rem)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column"
        }
      },
          h("div", { className: "slds-card", style: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", boxShadow: "0 4px 12px 0 rgba(0,0,0,0.1)" } },
             h("div", { style: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" } },
                this.renderPicker(),
                selectedCategory ? this.renderComparisonTable() : null
             )
          )
      )
    );
  }
}

{
  try {
    let args = new URLSearchParams(location.search.slice(1));
    let sfHost = args.get("host");
    if (!sfHost) {
        console.error("No host parameter found in URL");
        document.body.innerHTML = "<div style='padding: 20px; color: red;'>Error: No host parameter found. Please open from the popup.</div>";
    } else {
        // Ensure initButton is called if available
        if (typeof window.initButton === 'function') {
            window.initButton(sfHost, true);
        } else {
            console.warn("initButton is not defined on window");
        }

        sfConn.getSession(sfHost).then((res) => {
            let root = document.getElementById("root");
            if (!root) {
                console.error("Root element not found");
                return;
            }
            let model = new Model(sfHost, res, args);
            model.reactCallback = cb => {
                ReactDOM.render(h(App, {model}), root, cb);
            };
            ReactDOM.render(h(App, {model}), root);
        }).catch(err => {
            console.error("Error getting session:", err);
            document.body.innerHTML = `<div style='padding: 20px; color: red;'>Error initializing session: ${err.message}</div>`;
        });
    }
  } catch (e) {
    console.error("Initialization error:", e);
    document.body.innerHTML = `<div style='padding: 20px; color: red;'>Initialization Error: ${e.message}</div>`;
  }
}
