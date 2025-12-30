/* global React ReactDOM initButton */
import {sfConn, apiVersion} from "./inspector.js";
import {createSpinForMethod, copyToClipboard} from "./utils.js";
import AlertBanner from "./components/AlertBanner.js";
import {Spinner} from "./components/Spinner.js";

let h;

// All comparison categories matching the specification
const CATEGORIES = [
  {id: "pageLayouts", label: "Page Layouts"},
  {id: "objects", label: "Objects"},
  {id: "profiles", label: "Profiles"},
  {id: "permissionSets", label: "Permission Sets"},
  {id: "permissionSetGroups", label: "Permission Set Groups"},
  {id: "recordTypes", label: "Record Types"},
  {id: "fieldLevelSecurity", label: "Field-Level Security"},
  {id: "sharingSettings", label: "Sharing Settings"},
  {id: "roles", label: "Roles"},
  {id: "publicGroups", label: "Public Groups"},
  {id: "metadataDifferences", label: "Metadata Differences"},
  {id: "setupAuditTrail", label: "Setup Audit Trail"}
];

class OrgCompareModel {
  constructor(sfHost) {
    this.sfHost = sfHost;
    this.spinnerCount = 0;
    this.spinFor = createSpinForMethod(this);
    this.orgA = {host: sfHost, name: sfHost.split(".")[0]?.toUpperCase() || "Current Org"};
    this.data = null;
    this.error = null;
    this.updateCallbacks = [];
  }

  didUpdate(cb) {
    if (cb) this.updateCallbacks.push(cb);
    else this.updateCallbacks.forEach(c => c());
  }

  async fetchData(category) {
    const task = (async () => {
      this.data = null;
      this.error = null;
      let res = {};
      
      try {
        if (category === "objects") {
          const globalDescribe = await sfConn.rest("/services/data/v" + apiVersion + "/sobjects/");
          res.objects = Object.keys(globalDescribe.sobjects).map(key => ({
            name: key,
            label: globalDescribe.sobjects[key].label,
            custom: globalDescribe.sobjects[key].custom,
            keyPrefix: globalDescribe.sobjects[key].keyPrefix
          }));
        } 
        else if (category === "pageLayouts") {
          const q = "SELECT Id, Name, TableEnumOrId FROM Layout ORDER BY TableEnumOrId, Name";
          const layoutRes = await sfConn.rest(`/services/data/v${apiVersion}/tooling/query/?q=${encodeURIComponent(q)}`);
          res.layouts = layoutRes.records;
        }
        else if (category === "profiles") {
          const q = "SELECT Id, Name, UserType FROM Profile ORDER BY Name";
          const profileRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.profiles = profileRes.records;
        }
        else if (category === "permissionSets") {
          const q = "SELECT Id, Name, Label FROM PermissionSet WHERE IsCustom=true ORDER BY Label";
          const psRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.permissionSets = psRes.records;
        }
        else if (category === "permissionSetGroups") {
          const q = "SELECT Id, Name, DeveloperName FROM PermissionSetGroup ORDER BY Name";
          const psgRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.permissionSetGroups = psgRes.records;
        }
        else if (category === "recordTypes") {
          const q = "SELECT Id, Name, SobjectType, DeveloperName FROM RecordType ORDER BY SobjectType, Name";
          const rtRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.recordTypes = rtRes.records;
        }
        else if (category === "fieldLevelSecurity") {
          const q = "SELECT Id, Name FROM Profile ORDER BY Name";
          const profileRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.profiles = profileRes.records;
        }
        else if (category === "sharingSettings") {
          // Get OWD settings
          const q = "SELECT Id, SobjectType, DefaultAccessLevel FROM ObjectPermissions WHERE ParentId IN (SELECT Id FROM PermissionSet WHERE ProfileId != null) LIMIT 1";
          try {
            const owdRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
            res.sharingSettings = {owd: "Available", sharingRules: []};
          } catch (e) {
            res.sharingSettings = {owd: "Not accessible", sharingRules: []};
          }
        }
        else if (category === "roles") {
          const q = "SELECT Id, Name, ParentRoleId FROM UserRole ORDER BY Name";
          const roleRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.roles = roleRes.records;
        }
        else if (category === "publicGroups") {
          const q = "SELECT Id, Name, DeveloperName, Type FROM Group WHERE Type='Regular' ORDER BY Name";
          const groupRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.publicGroups = groupRes.records;
        }
        else if (category === "metadataDifferences") {
          // Placeholder - would need metadata API
          res.metadataDifferences = [];
        }
        else if (category === "setupAuditTrail") {
          const q = "SELECT Id, Action, CreatedBy.Name, CreatedDate, Display FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 100";
          const auditRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
          res.setupAuditTrail = auditRes.records;
        }

        this.data = res;
        this.didUpdate();

      } catch (err) {
        console.error(err);
        this.error = err.message || "Failed to fetch data";
        this.didUpdate();
      }
    })();
    await this.spinFor("Loading " + CATEGORIES.find(c => c.id === category)?.label, task);
    return task;
  }

  async fetchLayoutDetails(layoutIds) {
    if (!layoutIds || layoutIds.length === 0) return [];
    const idsStr = layoutIds.map(id => `'${id}'`).join(",");
    const q = `SELECT Id, Name, TableEnumOrId, Metadata FROM Layout WHERE Id IN (${idsStr})`;
    
    const task = (async () => {
      const res = await sfConn.rest(`/services/data/v${apiVersion}/tooling/query/?q=${encodeURIComponent(q)}`);
      return res.records;
    })();
    await this.spinFor("Loading layout details", task);
    return task;
  }

  async fetchProfilePermissions(profileIds) {
    if (!profileIds || profileIds.length === 0) return {};
    const profileIdsStr = profileIds.map(id => `'${id}'`).join(",");
    
    const task = (async () => {
      const psRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT Id, ProfileId FROM PermissionSet WHERE ProfileId IN (${profileIdsStr})`)}`);
      
      const profileToPsMap = {};
      const psIds = [];
      if (psRes.records) {
        psRes.records.forEach(ps => {
          profileToPsMap[ps.ProfileId] = ps.Id;
          psIds.push(ps.Id);
        });
      }

      if (psIds.length === 0) return { objectPerms: [], fieldPerms: [], profileToPsMap: {} };

      const psIdsStr = psIds.map(id => `'${id}'`).join(",");

      const objPerms = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT ParentId, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAll, PermissionsModifyAll FROM ObjectPermissions WHERE ParentId IN (${psIdsStr}) ORDER BY SobjectType`)}`);
      
      return {
        objectPerms: objPerms.records,
        fieldPerms: [],
        profileToPsMap
      };
    })();
    await this.spinFor("Loading profile permissions", task);
    return task;
  }

  async fetchPermissionSetDetails(psIds) {
    if (!psIds || psIds.length === 0) return {};
    const psIdsStr = psIds.map(id => `'${id}'`).join(",");
    
    const task = (async () => {
      const objPerms = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT ParentId, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAll, PermissionsModifyAll FROM ObjectPermissions WHERE ParentId IN (${psIdsStr}) ORDER BY SobjectType`)}`);
      
      return {
        objectPerms: objPerms.records
      };
    })();
    await this.spinFor("Loading permission set details", task);
    return task;
  }

  async fetchPermissionSetGroupDetails(psgId) {
    const task = (async () => {
      const q = `SELECT Id, (SELECT PermissionSetId FROM Assignments) FROM PermissionSetGroup WHERE Id = '${psgId}'`;
      const res = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(q)}`);
      if (res.records && res.records[0] && res.records[0].Assignments) {
        return res.records[0].Assignments.records.map(a => a.PermissionSetId);
      }
      return [];
    })();
    await this.spinFor("Loading permission set group", task);
    return task;
  }

  async fetchProfileOtherPermissions(profileIds) {
    if (!profileIds || profileIds.length === 0) return {};
    const profileIdsStr = profileIds.map(id => `'${id}'`).join(",");
    
    const task = (async () => {
      // 1. Get PermissionSet Ids
      const psRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT Id, ProfileId FROM PermissionSet WHERE ProfileId IN (${profileIdsStr})`)}`);
      
      const profileToPsMap = {};
      const psIds = [];
      if (psRes.records) {
        psRes.records.forEach(ps => {
          profileToPsMap[ps.ProfileId] = ps.Id;
          psIds.push(ps.Id);
        });
      }

      if (psIds.length === 0) return { apexPerms: [], vfPerms: [], profileToPsMap: {} };

      const psIdsStr = psIds.map(id => `'${id}'`).join(",");

      // 2. Fetch Apex Class Access
      const apexRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT ParentId, SetupEntityId, SetupEntity.Name FROM SetupEntityAccess WHERE ParentId IN (${psIdsStr}) AND SetupEntityType = 'ApexClass' ORDER BY SetupEntity.Name`)}`);
      
      // 3. Fetch Visualforce Page Access
      const vfRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT ParentId, SetupEntityId, SetupEntity.Name FROM SetupEntityAccess WHERE ParentId IN (${psIdsStr}) AND SetupEntityType = 'ApexPage' ORDER BY SetupEntity.Name`)}`);

      return {
        apexPerms: apexRes.records,
        vfPerms: vfRes.records,
        profileToPsMap
      };
    })();
    await this.spinFor("Loading other permissions", task);
    return task;
  }

  async fetchProfileFieldPermissionsForObject(profileIds, objectName) {
    if (!profileIds || profileIds.length === 0 || !objectName) return {};
    const profileIdsStr = profileIds.map(id => `'${id}'`).join(",");
    
    const task = (async () => {
      const psRes = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT Id, ProfileId FROM PermissionSet WHERE ProfileId IN (${profileIdsStr})`)}`);
      const psIds = psRes.records ? psRes.records.map(ps => ps.Id) : [];
      if (psIds.length === 0) return { fieldPerms: [], profileToPsMap: {} };

      const psIdsStr = psIds.map(id => `'${id}'`).join(",");
      const profileToPsMap = {};
      psRes.records.forEach(ps => profileToPsMap[ps.ProfileId] = ps.Id);

      const fieldPerms = await sfConn.rest(`/services/data/v${apiVersion}/query/?q=${encodeURIComponent(`SELECT ParentId, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (${psIdsStr}) AND SobjectType = '${objectName}' ORDER BY Field`)}`);
      
      return {
        fieldPerms: fieldPerms.records,
        profileToPsMap
      };
    })();
    await this.spinFor("Loading field permissions", task);
    return task;
  }
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.model = new OrgCompareModel(props.sfHost);
    this.state = {
      selectedCategory: "objects",
      isLoading: true
    };
    this.model.didUpdate(() => this.forceUpdate());
  }

  async componentDidMount() {
    try {
      await this.loadCategory(this.state.selectedCategory);
      this.setState({isLoading: false});
    } catch (error) {
      console.error("Error loading category:", error);
      this.setState({isLoading: false});
    }
  }

  async loadCategory(cat) {
    this.setState({selectedCategory: cat});
    await this.model.fetchData(cat);
  }

  render() {
    const {model} = this;
    const {selectedCategory} = this.state;
    
    if (!h) {
      h = React.createElement;
    }

    return h("div", {className: "org-compare-container"},
      h("div", {className: "org-compare-header"},
        h("div", {className: "slds-page-header"},
          h("div", {className: "slds-page-header__row"},
            h("div", {className: "slds-page-header__col-title"},
              h("div", {className: "slds-media"},
                h("div", {className: "slds-media__body"},
                  h("h1", {className: "slds-page-header__title"}, "In-Org Comparison"),
                  h("p", {className: "slds-page-header__meta-text"}, "Compare configurations within the same org")
                )
              )
            )
          )
        )
      ),
      h("div", {className: "org-compare-layout"},
        h("div", {className: "compare-sidebar"},
          h("div", {className: "sidebar-group"},
            h("div", {className: "sidebar-header"}, "Compare"),
            CATEGORIES.map(cat => 
              h("div", {
                key: cat.id,
                className: `sidebar-item ${selectedCategory === cat.id ? "selected" : ""}`,
                onClick: () => this.loadCategory(cat.id)
              }, cat.label)
            )
          )
        ),
        h("div", {className: "compare-content"},
          (model.spinnerCount > 0 || this.state.isLoading) && h(Spinner, {centered: true, text: "Loading..."}),
          model.error && h(AlertBanner, {
            type: "error",
            bannerText: model.error,
            iconName: "error",
            iconTitle: "Error",
            assistiveText: "Error",
            onClose: () => {
              model.error = null;
              model.didUpdate();
            },
            link: {text: ""}
          }),
          !this.state.isLoading && !model.error && this.renderCategoryContent()
        )
      )
    );
  }

  renderCategoryContent() {
    const {selectedCategory} = this.state;
    switch (selectedCategory) {
      case "objects": return h(ObjectsView, {model: this.model});
      case "pageLayouts": return h(PageLayoutsView, {model: this.model});
      case "profiles": return h(ProfilesView, {model: this.model});
      case "permissionSets": return h(PermissionSetsView, {model: this.model});
      case "permissionSetGroups": return h(PermissionSetGroupsView, {model: this.model});
      case "recordTypes": return h(RecordTypesView, {model: this.model});
      case "fieldLevelSecurity": return h(FieldLevelSecurityView, {model: this.model});
      case "sharingSettings": return h(SharingSettingsView, {model: this.model});
      case "roles": return h(RolesView, {model: this.model});
      case "publicGroups": return h(PublicGroupsView, {model: this.model});
      case "metadataDifferences": return h(MetadataDifferencesView, {model: this.model});
      case "setupAuditTrail": return h(SetupAuditTrailView, {model: this.model});
      default: return h("div", null, "Select a category");
    }
  }
}

// 1. Objects View
function ObjectsView({model}) {
  if (!model.data || !model.data.objects) return null;
  let objects = model.data.objects;
  objects.sort((a, b) => a.name.localeCompare(b.name));

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Objects"),
    h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null, 
          h("tr", null, 
            h("th", null, "Object Name"),
            h("th", null, "Label"),
            h("th", null, "Type"),
            h("th", null, "Key Prefix")
          )
        ),
        h("tbody", null,
          objects.map(obj => 
            h("tr", {key: obj.name},
              h("td", null, obj.name),
              h("td", null, obj.label),
              h("td", null, obj.custom ? "Custom" : "Standard"),
              h("td", null, obj.keyPrefix || "")
            )
          )
        )
      )
    )
  );
}

// 2. Page Layouts View
class PageLayoutsView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedObject: null,
      detailedLayouts: null
    };
  }

  async selectObject(objName) {
    this.setState({selectedObject: objName, detailedLayouts: null});
    const layouts = this.props.model.data.layouts.filter(l => l.TableEnumOrId === objName);
    if (layouts.length > 0) {
      const details = await this.props.model.fetchLayoutDetails(layouts.map(l => l.Id));
      this.setState({detailedLayouts: details});
    } else {
      this.setState({detailedLayouts: []});
    }
  }

  render() {
    const {model} = this.props;
    const {selectedObject, detailedLayouts} = this.state;

    if (!model.data || !model.data.layouts) return null;

    const layoutsByObject = {};
    model.data.layouts.forEach(l => {
      if (!layoutsByObject[l.TableEnumOrId]) layoutsByObject[l.TableEnumOrId] = [];
      layoutsByObject[l.TableEnumOrId].push(l);
    });

    const objects = Object.keys(layoutsByObject).sort();

    return h("div", {className: "content-card"},
      h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Page Layouts Comparison"),
      h("div", {className: "compare-toolbar"},
        h("div", {className: "toolbar-item"},
          h("label", null, "Select Object"),
          h("select", {
            className: "slds-select", 
            onChange: (e) => this.selectObject(e.target.value),
            value: selectedObject || ""
          },
            h("option", {value: ""}, "-- Select Object --"),
            objects.map(o => h("option", {key: o, value: o}, `${o} (${layoutsByObject[o].length} layouts)`))
          )
        )
      ),
      detailedLayouts && this.renderComparison(detailedLayouts)
    );
  }

  renderComparison(layouts) {
    if (layouts.length === 0) return h("div", {className: "slds-text-color_weak"}, "No layouts found for this object.");

    const allFields = new Set();
    const layoutFieldsMap = {};

    layouts.forEach(layout => {
      const fields = new Set();
      if (layout.Metadata && layout.Metadata.layoutSections) {
        const sections = Array.isArray(layout.Metadata.layoutSections) ? layout.Metadata.layoutSections : [layout.Metadata.layoutSections];
        sections.forEach(section => {
          const columns = Array.isArray(section.layoutColumns) ? section.layoutColumns : (section.layoutColumns ? [section.layoutColumns] : []);
          columns.forEach(col => {
            const items = Array.isArray(col.layoutItems) ? col.layoutItems : (col.layoutItems ? [col.layoutItems] : []);
            items.forEach(item => {
              if (item.field) {
                fields.add(item.field);
                allFields.add(item.field);
              }
            });
          });
        });
      }
      layoutFieldsMap[layout.Id] = fields;
    });

    const sortedFields = Array.from(allFields).sort();

    return h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Layout Name"),
            h("th", null, "Field Name"),
            h("th", null, "On Layout")
          )
        ),
        h("tbody", null,
          layouts.flatMap(layout =>
            sortedFields.map(f => {
              const isPresent = layoutFieldsMap[layout.Id].has(f);
              const presentInOtherLayouts = layouts.some(l => l.Id !== layout.Id && layoutFieldsMap[l.Id].has(f));
              const isDiff = isPresent !== presentInOtherLayouts;

              return h("tr", {
                key: `${layout.Id}-${f}`,
                className: isDiff ? "row-diff" : ""
              },
                h("td", null, layout.Name),
                h("td", null, f),
                h("td", {className: isPresent ? "cell-check" : "cell-missing"},
                  isPresent ? "☑" : "☐"
                )
              );
            })
          )
        )
      )
    );
  }
}

// 3. Profiles View
class ProfilesView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedProfiles: [],
      activeTab: "object", // object, field, apex, vf
      comparisonResults: null,
      otherResults: null, // For Apex/VF
      fieldResults: null, // For Field
      selectedObjectForFields: null
    };
  }

  onToggleProfile(id) {
    let set = new Set(this.state.selectedProfiles);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.setState({selectedProfiles: Array.from(set), comparisonResults: null, otherResults: null, fieldResults: null});
  }

  async onCompare() {
    const {selectedProfiles} = this.state;
    if (selectedProfiles.length < 2) return;
    
    // Fetch Object Perms by default
    const details = await this.props.model.fetchProfilePermissions(selectedProfiles);
    
    // Fetch Apex/VF Perms
    const otherDetails = await this.props.model.fetchProfileOtherPermissions(selectedProfiles);

    this.setState({comparisonResults: details, otherResults: otherDetails});
  }

  async loadFieldPermissions(objName) {
    if (!objName) {
      this.setState({selectedObjectForFields: null, fieldResults: null});
      return;
    }
    this.setState({selectedObjectForFields: objName});
    const {selectedProfiles} = this.state;
    if (selectedProfiles.length < 1) return;

    const details = await this.props.model.fetchProfileFieldPermissionsForObject(selectedProfiles, objName);
    this.setState({fieldResults: details});
  }

  render() {
    const {model} = this.props;
    const {selectedProfiles, comparisonResults, activeTab} = this.state;
    
    if (!model.data || !model.data.profiles) return null;

    const profiles = model.data.profiles;
    const profileMap = {};
    profiles.forEach(p => profileMap[p.Id] = p.Name);

    // Get Object list for Field Perms dropdown
    let objectOptions = [];
    if (model.data.objects) {
        objectOptions = model.data.objects.map(o => o.name).sort();
    }

    return h("div", {className: "content-card"},
      h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Profile Comparison"),
      h("div", {className: "profile-selection-container slds-m-bottom_medium"},
        h("div", {className: "slds-form-element"},
            h("div", {className: "slds-grid slds-grid_align-spread slds-m-bottom_xx-small"},
                h("label", {className: "slds-form-element__label"}, `Select Profiles (${selectedProfiles.length} selected)`),
                h("button", {
                    className: "slds-button slds-button_neutral slds-button_x-small",
                    onClick: () => this.setState({selectedProfiles: []})
                }, "Clear Selection")
            ),
            h("div", {
                className: "profile-grid-container", 
                style: {
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", 
                    gap: "0.5rem 1rem", 
                    maxHeight: "300px", 
                    overflowY: "auto", 
                    border: "1px solid #dddbda", 
                    padding: "0.75rem", 
                    borderRadius: "0.25rem",
                    backgroundColor: "#fafaf9"
                }
            },
                profiles.map(p => 
                    h("div", {key: p.Id, className: "slds-checkbox d-flex align-items-center"},
                        h("input", {
                            type: "checkbox", 
                            id: `check-${p.Id}`,
                            checked: selectedProfiles.includes(p.Id),
                            onChange: () => this.onToggleProfile(p.Id)
                        }),
                        h("label", {className: "slds-checkbox__label", htmlFor: `check-${p.Id}`},
                            h("span", {className: "slds-checkbox_faux"}),
                            h("span", {className: "slds-form-element__label", title: p.Name}, p.Name)
                        )
                    )
                )
            )
        ),
        h("div", {className: "slds-m-top_medium"},
          h("button", {
            className: "slds-button slds-button_brand", 
            disabled: selectedProfiles.length < 2,
            onClick: () => this.onCompare()
          }, `Compare Selected (${selectedProfiles.length})`),
          h("span", {className: "slds-m-left_small slds-text-color_weak"}, "Select at least 2 profiles to compare.")
        )
      ),
      comparisonResults && h("div", {className: "slds-tabs_default slds-m-top_medium"},
        h("ul", {className: "slds-tabs_default__nav", role: "tablist"},
          h("li", {className: `slds-tabs_default__item ${activeTab === "object" ? "slds-is-active" : ""}`, title: "Object Permissions", role: "presentation"},
            h("a", {className: "slds-tabs_default__link", href: "javascript:void(0);", role: "tab", onClick: () => this.setState({activeTab: "object"})}, "Object Permissions")
          ),
          h("li", {className: `slds-tabs_default__item ${activeTab === "field" ? "slds-is-active" : ""}`, title: "Field Permissions", role: "presentation"},
            h("a", {className: "slds-tabs_default__link", href: "javascript:void(0);", role: "tab", onClick: () => this.setState({activeTab: "field"})}, "Field Permissions")
          ),
          h("li", {className: `slds-tabs_default__item ${activeTab === "apex" ? "slds-is-active" : ""}`, title: "Apex Class Access", role: "presentation"},
            h("a", {className: "slds-tabs_default__link", href: "javascript:void(0);", role: "tab", onClick: () => this.setState({activeTab: "apex"})}, "Apex Class Access")
          ),
          h("li", {className: `slds-tabs_default__item ${activeTab === "vf" ? "slds-is-active" : ""}`, title: "Visualforce Page Access", role: "presentation"},
            h("a", {className: "slds-tabs_default__link", href: "javascript:void(0);", role: "tab", onClick: () => this.setState({activeTab: "vf"})}, "Visualforce Page Access")
          )
        ),
        h("div", {className: `slds-tabs_default__content ${activeTab === "object" ? "slds-show" : "slds-hide"}`, role: "tabpanel"},
            this.renderObjectComparison(comparisonResults, selectedProfiles, profileMap)
        ),
        h("div", {className: `slds-tabs_default__content ${activeTab === "field" ? "slds-show" : "slds-hide"}`, role: "tabpanel"},
            h("div", {className: "slds-form-element slds-m-bottom_small"},
                h("label", {className: "slds-form-element__label"}, "Select Object to Compare Fields"),
                h("div", {className: "slds-form-element__control"},
                    h("select", {
                        className: "slds-select",
                        style: {maxWidth: "300px"},
                        onChange: (e) => this.loadFieldPermissions(e.target.value),
                        value: this.state.selectedObjectForFields || ""
                    },
                        h("option", {value: ""}, "-- Select Object --"),
                        // If objects are loaded in model, use them. If not, we might need to fetch them or rely on what's available.
                        // Ideally objects are fetched when category is loaded. But if user went straight to Profiles, objects might not be loaded.
                        // We can use model.data.objects if available, or just render "Go to Objects tab to load objects first" if empty.
                        objectOptions.map(o => h("option", {key: o, value: o}, o))
                    )
                )
            ),
            this.state.fieldResults ? this.renderFieldComparison(this.state.fieldResults, selectedProfiles, profileMap) : h("div", {className: "slds-text-color_weak"}, "Select an object to view field permissions.")
        ),
        h("div", {className: `slds-tabs_default__content ${activeTab === "apex" ? "slds-show" : "slds-hide"}`, role: "tabpanel"},
           this.state.otherResults && this.renderSetupEntityComparison(this.state.otherResults.apexPerms, this.state.otherResults.profileToPsMap, selectedProfiles, profileMap, "Apex Class")
        ),
        h("div", {className: `slds-tabs_default__content ${activeTab === "vf" ? "slds-show" : "slds-hide"}`, role: "tabpanel"},
           this.state.otherResults && this.renderSetupEntityComparison(this.state.otherResults.vfPerms, this.state.otherResults.profileToPsMap, selectedProfiles, profileMap, "Visualforce Page")
        )
      )
    );
  }

  renderObjectComparison(results, selectedIds, profileMap) {
    const {objectPerms, profileToPsMap} = results;
    const sobjects = new Set();
    const permsMap = {};

    if (objectPerms) {
      objectPerms.forEach(perm => {
        sobjects.add(perm.SobjectType);
        if (!permsMap[perm.SobjectType]) permsMap[perm.SobjectType] = {};
        permsMap[perm.SobjectType][perm.ParentId] = perm;
      });
    }

    const sortedSobjects = Array.from(sobjects).sort();
    const permFields = ["PermissionsRead", "PermissionsCreate", "PermissionsEdit", "PermissionsDelete", "PermissionsViewAll", "PermissionsModifyAll"];
    const permLabels = ["Read", "Create", "Edit", "Delete", "View All", "Modify All"];

    return h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Object"),
            h("th", null, "Permission"),
            selectedIds.map(id => h("th", {key: id}, profileMap[id]))
          )
        ),
        h("tbody", null,
          sortedSobjects.flatMap(obj => {
            const rows = [];
            permFields.forEach((field, fIdx) => {
              const values = selectedIds.map(pid => {
                const psId = profileToPsMap[pid];
                const p = psId && permsMap[obj] ? permsMap[obj][psId] : null;
                return p ? p[field] : false;
              });
              const firstVal = values[0];
              const diff = values.some(v => v !== firstVal);

              if (diff || firstVal) { // Show if diff OR if at least one has permission (to avoid showing all empty rows) - actually prompt says "find difference", so maybe show all active? Let's show diff and active.
                rows.push(
                  h("tr", {
                    key: obj + field,
                    className: diff ? "row-diff" : ""
                  },
                    h("td", null, obj),
                    h("td", null, permLabels[fIdx]),
                    selectedIds.map((pid, idx) => {
                      const psId = profileToPsMap[pid];
                      const p = psId && permsMap[obj] ? permsMap[obj][psId] : null;
                      const val = p ? p[field] : false;
                      return h("td", {
                        key: pid,
                        className: val ? "cell-check" : "cell-missing"
                      }, val ? "☑" : "☐");
                    })
                  )
                );
              }
            });
            return rows;
          })
        )
      )
    );
  }

  renderFieldComparison(results, selectedIds, profileMap) {
      const {fieldPerms, profileToPsMap} = results;
      const fields = new Set();
      // key: Field -> { psId -> {PermissionsRead, PermissionsEdit} }
      const permsMap = {}; 

      if (fieldPerms) {
          fieldPerms.forEach(fp => {
              fields.add(fp.Field);
              if (!permsMap[fp.Field]) permsMap[fp.Field] = {};
              permsMap[fp.Field][fp.ParentId] = fp;
          });
      }

      const sortedFields = Array.from(fields).sort();
      const pTypes = ["Read", "Edit"];

      return h("div", {className: "matrix-scroll"},
          h("table", {className: "data-table"},
              h("thead", null,
                  h("tr", null,
                      h("th", null, "Field"),
                      h("th", null, "Access"),
                      selectedIds.map(id => h("th", {key: id}, profileMap[id]))
                  )
              ),
              h("tbody", null,
                  sortedFields.flatMap(f => {
                      const rows = [];
                      pTypes.forEach((pt, idx) => {
                          const isRead = pt === "Read";
                          const prop = isRead ? "PermissionsRead" : "PermissionsEdit";
                          
                          const values = selectedIds.map(pid => {
                              const psId = profileToPsMap[pid];
                              const r = psId && permsMap[f] ? permsMap[f][psId] : null;
                              return r ? r[prop] : false;
                          });
                          
                          const firstVal = values[0];
                          const diff = values.some(v => v !== firstVal);

                          if (diff || firstVal) {
                               rows.push(
                                  h("tr", {key: f + pt, className: diff ? "row-diff" : ""},
                                      h("td", null, f),
                                      h("td", null, pt),
                                      selectedIds.map(pid => {
                                          const psId = profileToPsMap[pid];
                                          const r = psId && permsMap[f] ? permsMap[f][psId] : null;
                                          const val = r ? r[prop] : false;
                                          return h("td", {key: pid, className: val ? "cell-check" : "cell-missing"}, val ? "☑" : "☐");
                                      })
                                  )
                               );
                          }
                      });
                      return rows;
                  })
              )
          )
      );
  }

  renderSetupEntityComparison(perms, profileToPsMap, selectedIds, profileMap, entityLabel) {
      const entities = new Set();
      // key: SetupEntityId -> { psId -> true }
      const permsMap = {};
      const entityNames = {}; // SetupEntityId -> Name

      if (perms) {
          perms.forEach(p => {
              const eId = p.SetupEntityId;
              const name = p.SetupEntity ? p.SetupEntity.Name : eId;
              entities.add(eId);
              entityNames[eId] = name;
              
              if (!permsMap[eId]) permsMap[eId] = {};
              permsMap[eId][p.ParentId] = true;
          });
      }

      const sortedEntities = Array.from(entities).sort((a, b) => entityNames[a].localeCompare(entityNames[b]));

      return h("div", {className: "matrix-scroll"},
          h("table", {className: "data-table"},
              h("thead", null,
                  h("tr", null,
                      h("th", null, entityLabel + " Name"),
                      selectedIds.map(id => h("th", {key: id}, profileMap[id]))
                  )
              ),
              h("tbody", null,
                  sortedEntities.map(eId => {
                      const values = selectedIds.map(pid => {
                          const psId = profileToPsMap[pid];
                          return psId && permsMap[eId] && permsMap[eId][psId] ? true : false;
                      });

                    const firstVal = values[0];
                    const diff = values.some(v => v !== firstVal);
                    // Show if diff or if present (enabled)
                    if (!diff && !firstVal) return null; 

                      return h("tr", {key: eId, className: diff ? "row-diff" : ""},
                          h("td", null, entityNames[eId]),
                          selectedIds.map((pid, idx) => {
                               const val = values[idx];
                               return h("td", {key: pid, className: val ? "cell-check" : "cell-missing"}, val ? "☑" : "☐");
                          })
                      );
                  }).filter(x => x !== null)
              )
          )
      );
  }
}

// 4. Permission Sets View
class PermissionSetsView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedPS: [],
      comparisonResults: null
    };
  }

  onTogglePS(id) {
    let set = new Set(this.state.selectedPS);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.setState({selectedPS: Array.from(set), comparisonResults: null});
  }

  async onCompare() {
    const {selectedPS} = this.state;
    if (selectedPS.length < 2) return;
    
    const details = await this.props.model.fetchPermissionSetDetails(selectedPS);
    this.setState({comparisonResults: details});
  }

  render() {
    const {model} = this.props;
    const {selectedPS, comparisonResults} = this.state;
    
    if (!model.data || !model.data.permissionSets) return null;

    const psList = model.data.permissionSets;
    const psMap = {};
    psList.forEach(ps => psMap[ps.Id] = ps.Label || ps.Name);

    return h("div", {className: "content-card"},
      h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Permission Set Comparison"),
      h("div", {className: "profile-selection-container slds-m-bottom_medium"},
        h("div", {className: "slds-form-element"},
            h("div", {className: "slds-grid slds-grid_align-spread slds-m-bottom_xx-small"},
                h("label", {className: "slds-form-element__label"}, `Select Permission Sets (${selectedPS.length} selected)`),
                h("button", {
                    className: "slds-button slds-button_neutral slds-button_x-small",
                    onClick: () => this.setState({selectedPS: []})
                }, "Clear Selection")
            ),
            h("div", {
                className: "profile-grid-container", 
                style: {
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", 
                    gap: "0.5rem 1rem", 
                    maxHeight: "300px", 
                    overflowY: "auto", 
                    border: "1px solid #dddbda", 
                    padding: "0.75rem", 
                    borderRadius: "0.25rem",
                    backgroundColor: "#fafaf9"
                }
            },
                psList.map(ps => 
                    h("div", {key: ps.Id, className: "slds-checkbox d-flex align-items-center"},
                        h("input", {
                            type: "checkbox", 
                            id: `ps-${ps.Id}`,
                            checked: selectedPS.includes(ps.Id),
                            onChange: () => this.onTogglePS(ps.Id)
                        }),
                        h("label", {className: "slds-checkbox__label", htmlFor: `ps-${ps.Id}`},
                            h("span", {className: "slds-checkbox_faux"}),
                            h("span", {className: "slds-form-element__label", title: ps.Label || ps.Name}, ps.Label || ps.Name)
                        )
                    )
                )
            )
        ),
        h("div", {className: "slds-m-top_medium"},
          h("button", {
            className: "slds-button slds-button_brand", 
            disabled: selectedPS.length < 2,
            onClick: () => this.onCompare()
          }, `Compare Selected (${selectedPS.length})`),
          h("span", {className: "slds-m-left_small slds-text-color_weak"}, "Select at least 2 permissions sets to compare.")
        )
      ),
      comparisonResults && this.renderComparison(comparisonResults, selectedPS, psMap)
    );
  }

  renderComparison(results, selectedIds, psMap) {
    const {objectPerms} = results;
    const sobjects = new Set();
    const permsMap = {};

    if (objectPerms) {
      objectPerms.forEach(perm => {
        sobjects.add(perm.SobjectType);
        if (!permsMap[perm.SobjectType]) permsMap[perm.SobjectType] = {};
        permsMap[perm.SobjectType][perm.ParentId] = perm;
      });
    }

    const sortedSobjects = Array.from(sobjects).sort();
    const permFields = ["PermissionsModifyAll"];
    const permLabels = ["Modify All"];

    return h("div", {className: "matrix-scroll slds-m-top_medium"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Object"),
            h("th", null, "Permission"),
            selectedIds.map(id => h("th", {key: id}, psMap[id]))
          )
        ),
        h("tbody", null,
          sortedSobjects.flatMap(obj => {
            const rows = [];
            permFields.forEach((field, fIdx) => {
              const values = selectedIds.map(psId => {
                const p = permsMap[obj] ? permsMap[obj][psId] : null;
                return p ? p[field] : false;
              });
              const firstVal = values[0];
              const diff = values.some(v => v !== firstVal);

              if (diff || firstVal) {
                rows.push(
                  h("tr", {
                    key: obj + field,
                    className: diff ? "row-diff" : ""
                  },
                    h("td", null, obj),
                    h("td", null, permLabels[fIdx]),
                    selectedIds.map((psId, idx) => {
                      const p = permsMap[obj] ? permsMap[obj][psId] : null;
                      const val = p ? p[field] : false;
                      return h("td", {
                        key: psId,
                        className: val ? "cell-check" : "cell-missing"
                      }, val ? "☑ ⚠️" : "☐");
                    })
                  )
                );
              }
            });
            return rows;
          })
        )
      )
    );
  }
}

// 5. Permission Set Groups View
class PermissionSetGroupsView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedPSG: null,
      psgDetails: null
    };
  }

  async selectPSG(psgId) {
    this.setState({selectedPSG: psgId, psgDetails: null});
    if (psgId) {
      const psIds = await this.props.model.fetchPermissionSetGroupDetails(psgId);
      this.setState({psgDetails: psIds});
    }
  }

  render() {
    const {model} = this.props;
    const {selectedPSG, psgDetails} = this.state;
    
    if (!model.data || !model.data.permissionSetGroups) return null;

    const psgList = model.data.permissionSetGroups;

    return h("div", {className: "content-card"},
      h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Permission Set Groups"),
      h("div", {className: "compare-toolbar"},
        h("div", {className: "toolbar-item"},
          h("label", null, "Select Permission Set Group"),
          h("select", {
            className: "slds-select",
            onChange: (e) => this.selectPSG(e.target.value),
            value: selectedPSG || ""
          },
            h("option", {value: ""}, "-- Select Group --"),
            psgList.map(psg => h("option", {key: psg.Id, value: psg.Id}, psg.Name))
          )
        )
      ),
      psgDetails && h("div", {className: "matrix-scroll slds-m-top_medium"},
        h("table", {className: "data-table"},
          h("thead", null,
            h("tr", null,
              h("th", null, "Permission Set"),
              h("th", null, "Included")
            )
          ),
          h("tbody", null,
            psgDetails.map(psId => 
              h("tr", {key: psId},
                h("td", null, psId),
                h("td", {className: "cell-check"}, "☑")
              )
            )
          )
        )
      )
    );
  }
}

// 6. Record Types View
function RecordTypesView({model}) {
  if (!model.data || !model.data.recordTypes) return null;

  const recordTypes = model.data.recordTypes;
  const byObject = {};
  recordTypes.forEach(rt => {
    if (!byObject[rt.SobjectType]) byObject[rt.SobjectType] = [];
    byObject[rt.SobjectType].push(rt);
  });

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Record Types"),
    h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Object"),
            h("th", null, "Record Type"),
            h("th", null, "Developer Name")
          )
        ),
        h("tbody", null,
          Object.keys(byObject).sort().flatMap(obj =>
            byObject[obj].map(rt =>
              h("tr", {key: rt.Id},
                h("td", null, obj),
                h("td", null, rt.Name),
                h("td", null, rt.DeveloperName)
              )
            )
          )
        )
      )
    )
  );
}

// 7. Field-Level Security View
function FieldLevelSecurityView({model}) {
  if (!model.data || !model.data.profiles) return null;

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Field-Level Security"),
    h("div", {className: "slds-text-color_weak"}, "Select a field to view FLS across profiles. (Implementation in progress)")
  );
}

// 8. Sharing Settings View
function SharingSettingsView({model}) {
  if (!model.data || !model.data.sharingSettings) return null;

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Sharing Settings"),
    h("div", {className: "slds-text-color_weak"}, "OWD: " + model.data.sharingSettings.owd)
  );
}

// 9. Roles View
function RolesView({model}) {
  if (!model.data || !model.data.roles) return null;

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Roles"),
    h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Role Name"),
            h("th", null, "Parent Role")
          )
        ),
        h("tbody", null,
          model.data.roles.map(role =>
            h("tr", {key: role.Id},
              h("td", {className: "cell-check"}, "☑ " + role.Name),
              h("td", null, role.ParentRoleId || "-")
            )
          )
        )
      )
    )
  );
}

// 10. Public Groups View
function PublicGroupsView({model}) {
  if (!model.data || !model.data.publicGroups) return null;

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Public Groups"),
    h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Group Name"),
            h("th", null, "Developer Name"),
            h("th", null, "Type")
          )
        ),
        h("tbody", null,
          model.data.publicGroups.map(group =>
            h("tr", {key: group.Id},
              h("td", null, group.Name),
              h("td", null, group.DeveloperName || ""),
              h("td", null, group.Type)
            )
          )
        )
      )
    )
  );
}

// 11. Metadata Differences View
function MetadataDifferencesView({model}) {
  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Metadata Differences"),
    h("div", {className: "slds-text-color_weak"}, "Metadata comparison requires Metadata API access. (Implementation in progress)")
  );
}

// 12. Setup Audit Trail View
function SetupAuditTrailView({model}) {
  if (!model.data || !model.data.setupAuditTrail) return null;

  return h("div", {className: "content-card"},
    h("h2", {className: "slds-text-heading_medium slds-m-bottom_medium"}, "Setup Audit Trail"),
    h("div", {className: "matrix-scroll"},
      h("table", {className: "data-table"},
        h("thead", null,
          h("tr", null,
            h("th", null, "Action"),
            h("th", null, "Changed By"),
            h("th", null, "Date"),
            h("th", null, "Display")
          )
        ),
        h("tbody", null,
          model.data.setupAuditTrail.map(audit =>
            h("tr", {key: audit.Id},
              h("td", null, audit.Action),
              h("td", null, audit.CreatedBy?.Name || ""),
              h("td", null, new Date(audit.CreatedDate).toLocaleString()),
              h("td", null, audit.Display || "")
            )
          )
        )
      )
    )
  );
}

// Initialize app
{
  function init() {
    if (typeof React === "undefined" || typeof ReactDOM === "undefined") {
      console.error("React or ReactDOM not loaded");
      let root = document.getElementById("root");
      if (root) {
        root.innerHTML = `<div style="padding: 2rem; color: red;">Error: React libraries not loaded. Please refresh the page.</div>`;
      }
      return;
    }

    // Define h now that React is available
    h = React.createElement;

    let args = new URLSearchParams(location.search.slice(1));
    let sfHost = args.get("host");
    
    if (!sfHost) {
      console.error("No host parameter found");
      let root = document.getElementById("root");
      if (root) {
        root.innerHTML = `<div style="padding: 2rem; color: red;">Error: No host parameter in URL</div>`;
      }
      return;
    }

    if (typeof initButton === "undefined") {
      console.error("initButton not available");
      let root = document.getElementById("root");
      if (root) {
        root.innerHTML = `<div style="padding: 2rem; color: red;">Error: Button initialization not available. Please refresh the page.</div>`;
      }
      return;
    }

    initButton(sfHost, true);
    sfConn.getSession(sfHost).then(() => {
      let root = document.getElementById("root");
      if (root) {
        try {
          ReactDOM.render(h(App, {sfHost}), root);
        } catch (error) {
          console.error("Error rendering React app:", error);
          root.innerHTML = `<div style="padding: 2rem; color: red;">Error rendering: ${error.message}<br><pre>${error.stack}</pre></div>`;
        }
      } else {
        console.error("Root element not found");
      }
    }).catch(error => {
      console.error("Error initializing app:", error);
      let root = document.getElementById("root");
      if (root) {
        root.innerHTML = `<div style="padding: 2rem; color: red;">Error loading: ${error.message}<br><pre>${error.stack}</pre></div>`;
      }
    });
  }

  // Wait for React to be available
  function waitForReact() {
    if (typeof React !== "undefined" && typeof ReactDOM !== "undefined" && typeof initButton !== "undefined") {
      // Set h now that React is available
      h = React.createElement;
      init();
    } else {
      setTimeout(waitForReact, 50);
    }
  }

  // Start waiting for React
  waitForReact();
}
