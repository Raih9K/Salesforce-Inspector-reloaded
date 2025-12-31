/* global React ReactDOM */
import {sfConn, apiVersion} from "../addon/inspector.js";

import {PageHeader} from "../addon/components/PageHeader.js";
import {UserInfoModel, createSpinForMethod} from "../addon/utils.js";

const categories = [
  // Core Security & Access
  { id: "profiles", label: "Profiles", icon: "user_role", color: "#6ca1fb", group: "Core Security & Access", description: "Compare User Permissions, Object Permissions, Field Permissions, and more between Profiles.", metaType: "Profile" },
  { id: "permSets", label: "Permission Sets", icon: "lock", color: "#f77e2e", group: "Core Security & Access", description: "Compare System and Object permissions between Permission Sets.", metaType: "PermissionSet" },
  { id: "permSetGroups", label: "Permission Set Groups", icon: "groups", color: "#eb6c61", group: "Core Security & Access", description: "Compare composition of Permission Set Groups.", metaType: "PermissionSetGroup" },
  { id: "roles", label: "Roles", icon: "hierarchy", color: "#8d64c0", group: "Core Security & Access", description: "Compare Role hierarchy and properties.", metaType: "Role" },
  { id: "groups", label: "Public Groups", icon: "groups", color: "#74cdf1", group: "Core Security & Access", description: "Compare Public Group members.", metaType: "Group" },
  { id: "sharing", label: "Sharing Settings", icon: "share", color: "#6b9ee0", group: "Core Security & Access", description: "Check OWD and Sharing Rules.", metaType: "SharingRules" },

  // UI & Configuration
  { id: "layouts", label: "Page Layouts", icon: "layout", color: "#54c4f9", group: "UI & Configuration", description: "Compare field visibility and arrangement across Layouts.", metaType: "Layout" },
  { id: "objects", label: "Objects", icon: "custom_apps", color: "#ef7ead", group: "UI & Configuration", description: "Compare Object properties, fields, and validation rules.", metaType: "CustomObject" },
  { id: "fls", label: "Field-Level Security", icon: "password", color: "#53ca98", group: "UI & Configuration", description: "Compare Read/Edit access for fields across Profiles/Perm Sets.", metaType: "Profile" },

  // User Management
  { id: "users", label: "Users", icon: "user", color: "#4bca81", group: "User Management", description: "Compare User record fields (Profile, Role, etc.).", metaType: "User" },

  // Audit & Monitoring
  { id: "audit", label: "Setup Audit Trail", icon: "clock", color: "#939393", group: "Audit & Monitoring", description: "Review recent setup changes." },
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
      selectedCategory: null,
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
             await this.compareProfiles(itemNames);
         } else if (selectedCategory.id === "permSets") {
             this.processProfileComparison(itemNames, allMetadata);
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

    async compareProfiles(profileNames) {
      const { model } = this.props;
      const results = {}; // Map<ProfileName, { objects: [], fields: [], sys: [] }>
      
      // Common System Permissions to check
      const sysPermsToCheck = [
          "PermissionsApiEnabled", "PermissionsModifyAllData", "PermissionsViewAllData", 
          "PermissionsCustomizeApplication", "PermissionsManageUsers", "PermissionsPasswordNeverExpires",
          "PermissionsAuthorApex", "PermissionsManageCustomPermissions"
      ];
      // Create select clause
      const sysSelect = sysPermsToCheck.join(", ");

      for (const name of profileNames) {
          // Field Perms
          const fieldQuery = `SELECT Id, Field, SObjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (SELECT Id FROM PermissionSet WHERE PermissionSet.Profile.Name = '${name}')`;
          const fieldRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(fieldQuery)));
          
          // Object Perms
          const objQuery = `SELECT Id, ParentId, SObjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId IN (SELECT Id FROM PermissionSet WHERE PermissionSet.Profile.Name = '${name}')`;
          const objRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(objQuery)));

          // System/User Perms (via PermissionSet)
          const sysQuery = `SELECT ${sysSelect} FROM PermissionSet WHERE Profile.Name = '${name}'`;
          const sysRes = await model.spinFor(sfConn.rest("/services/data/v" + apiVersion + "/query/?q=" + encodeURIComponent(sysQuery)));

          const profileData = {
              objects: {},
              fields: {},
              sys: {}
          };

          if (objRes && objRes.records) {
              objRes.records.forEach(p => {
                  profileData.objects[p.SobjectType] = {
                      Read: p.PermissionsRead,
                      Create: p.PermissionsCreate,
                      Edit: p.PermissionsEdit,
                      Delete: p.PermissionsDelete,
                      ViewAll: p.PermissionsViewAllRecords,
                      ModifyAll: p.PermissionsModifyAllRecords
                  };
              });
          }

          if (fieldRes && fieldRes.records) {
              fieldRes.records.forEach(p => {
                  profileData.fields[p.Field] = {
                      Read: p.PermissionsRead,
                      Edit: p.PermissionsEdit
                  };
              });
          }

          if (sysRes && sysRes.records && sysRes.records.length > 0) {
              const r = sysRes.records[0]; // Should be one perm set for the profile? Or maybe multiply if duplicates (unlikely for Profile owned)
              sysPermsToCheck.forEach(key => {
                   // key is PermissionsApiEnabled, display as ApiEnabled
                   const shortKey = key.replace("Permissions", "");
                   profileData.sys[shortKey] = r[key] ? "true" : "false";
              });
          }
          
          results[name] = profileData;
      }

      // Aggregate for View
      const allObjects = new Set();
      const allFields = new Set();
      const allSys = new Set();

      Object.values(results).forEach(d => {
          Object.keys(d.objects).forEach(k => allObjects.add(k));
          Object.keys(d.fields).forEach(k => allFields.add(k));
          Object.keys(d.sys).forEach(k => allSys.add(k));
      });

      const sortedObjects = Array.from(allObjects).sort();
      const sortedFields = Array.from(allFields).sort();
      const sortedSys = Array.from(allSys).sort();

      this.setState({
          comparisonData: {
              type: "structured_profile_transposed",
              rows: profileNames,
              sections: [
                 { 
                      title: "User Permissions", 
                      keys: sortedSys, 
                      subCols: ["Value"],
                      getData: (itemName, key) => ({ Value: results[itemName]?.sys[key] })
                  },
                  { 
                      title: "Object Permissions", 
                      keys: sortedObjects, 
                      subCols: ["Read", "Create", "Edit", "Delete", "ViewAll", "ModifyAll"],
                      getData: (itemName, key) => results[itemName]?.objects[key] || {}
                  },
                  { 
                      title: "Field Permissions", 
                      keys: sortedFields, 
                      subCols: ["Read", "Edit"],
                      getData: (itemName, key) => results[itemName]?.fields[key] || {}
                  }
              ]
          }
      });
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
    const { comparisonData, activeSectionTitle } = this.state;
    if (!comparisonData) return null;

    if (comparisonData.type === "structured_profile_transposed") {
        const sections = comparisonData.sections || [];
        if (sections.length === 0) return null;

        // Default to first section if no active section selected
        const currentTitle = activeSectionTitle || sections[0].title;
        const activeSection = sections.find(s => s.title === currentTitle) || sections[0];

        return h("div", { className: "slds-card slds-m-top_medium", style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "200px" } },
            // Tab Bar
            h("div", { className: "slds-card__header slds-grid slds-p-bottom_none", style: { overflowX: "auto", flexShrink: 0 } },
                h("div", { className: "slds-button-group", role: "group" },
                    sections.map(s => 
                        h("button", { 
                            key: s.title,
                            className: `slds-button slds-button_neutral ${currentTitle === s.title ? "slds-button_brand" : ""}`,
                            onClick: () => this.setState({ activeSectionTitle: s.title })
                        }, s.title)
                    )
                )
            ),
            
            // Filter Bar (Placeholder for now, matching UI)
            h("div", { className: "slds-p-horizontal_medium slds-p-vertical_x-small slds-border_bottom", style: { display: "flex", alignItems: "center", backgroundColor: "#f3f2f2" } },
               h("span", { className: "slds-text-title_caps slds-m-right_small" }, activeSection.title),
               // Add export buttons here if needed later
            ),

            // Table Content
            h("div", { className: "slds-card__body slds-card__body_inner", style: { overflow: "auto", flex: 1, padding: 0 } },
                this.renderTransposedTable(activeSection, comparisonData.rows)
            )
        );
    } else if (comparisonData.type === "structured_profile") { 
          // Keep existing valid for Users flow until migrated or if compatible
          // Actually, let's migrate renderStructuredSection to be compatible or deprecate it if we want ALL to be transposed.
          // Users flow generates "structured_profile" data. I should update compareUsers to produce "transposed" data too.
          return this.renderStructuredSection(comparisonData.sections[0], comparisonData.columns, 0); // Temporary fallback logic if needed
      } else {
          return this.renderGenericTable(comparisonData);
      }
  }

  renderTransposedTable(section, rowItems) {
    if (!section.keys || section.keys.length === 0) return h("div", { className: "slds-p-around_medium" }, "No data available for this section.");

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
                    h("th", { key: item, style: { width: "150px", position: "sticky", top: 0, backgroundColor: "#f3f2f2", borderBottom: "1px solid #dddbda" } },
                        h("div", { className: "slds-truncate", title: item }, item)
                    )
                )
            )
        ),
        h("tbody", {},
            section.keys.map(key => {
                const subCols = section.subCols || ["Value"];
                
                return subCols.map(subCol => {
                    // Logic to display cleaner labels
                    const isSystem = section.title === "User Permissions"; // Heuristic
                    const isObject = section.title === "Object Permissions";

                    let rowLabel = key;
                    let apiName = key;
                    
                    if (isObject) {
                        rowLabel = `${key} [${subCol}]`;
                        apiName = `${key}.${subCol}`; // e.g. Account.Read
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

  renderCategories() {
    const { selectedCategory } = this.state;
    const groups = [...new Set(categories.map(c => c.group))];

    return h("div", { className: "slds-card slds-m-around_medium", style: { width: "250px", flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", marginRight: "0" } },
        h("div", { className: "slds-nav-vertical slds-p-vertical_small" },
            groups.map(groupName => 
                h("div", { key: groupName, className: "slds-nav-vertical__section slds-m-bottom_small" },
                    h("h2", { className: "slds-nav-vertical__title slds-text-title_caps slds-p-horizontal_small" }, groupName),
                    h("ul", {},
                        categories.filter(c => c.group === groupName).map(cat => 
                            h("li", { key: cat.id, className: `slds-nav-vertical__item ${selectedCategory && selectedCategory.id === cat.id ? "slds-is-active" : ""}` },
                                h("a", { className: `slds-nav-vertical__action ${selectedCategory && selectedCategory.id === cat.id ? "slds-is-current" : ""}`, href: "#", onClick: (e) => { e.preventDefault(); this.onCategorySelect(cat); } },
                                    h("span", { className: `slds-icon_container slds-m-right_x-small`, style: { transform: "scale(0.8)", backgroundColor: cat.color || "#b0adab" } },
                                       h("svg", { className: "slds-icon slds-icon_x-small", "aria-hidden": "true" }, h("use", { xlinkHref: `symbols.svg#${cat.icon || "custom_apps"}` }))
                                    ),
                                    cat.label
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

    return h("div", {},
      h(PageHeader, {
        pageTitle: "Org Comparison",
        orgName: model.orgName,
        sfLink: model.sfLink,
        sfHost: model.sfHost,
        spinnerCount: model.spinnerCount,
        ...model.userInfoModel.getProps(),
        utilityItems: []
      }),
      h("div", {
        className: "slds-m-top_xx-large",
        style: {
          display: "flex",
          flexDirection: "row", // Changed to row for sidebar + content
          height: "calc(100vh - 4rem)"
        }
      },
          this.renderCategories(),
          h("div", { className: "slds-card slds-m-around_medium", style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" } },
             h("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" } },
                this.renderPicker(),
                this.renderComparisonTable()
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
