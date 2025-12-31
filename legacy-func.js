$(function () {
	const VIEW_SYSTEM_PERMISSION = "VIEW_SYSTEM_PERMISSION";
	const VIEW_OBJECT_PERMISSION = "VIEW_OBJECT_PERMISSION";
	const VIEW_FIELD_PERMISSION = "VIEW_FIELD_PERMISSION";
	const VIEW_LAYOUT_ASSIGN = "VIEW_LAYOUT_ASSIGN";
	const VIEW_CLASS_ACCESS = "VIEW_CLASS_ACCESS";
	const VIEW_PAGE_ACCESS = "VIEW_PAGE_ACCESS";
	const VIEW_TAB_ACCESS = "VIEW_TAB_ACCESS";
	const VIEW_APP_ACCESS = "VIEW_APP_ACCESS";
	const VIEW_ACCESS_RESTRICTION = "VIEW_ACCESS_RESTRICTION";
	const VIEW_PERMISSION_SET_GROUP = "VIEW_PERMISSION_SET_GROUP";
	const VIEW_PERMISSION_SET_ASSIGN = "VIEW_PERMISSION_SET_ASSIGN";

	const MODE_PROFILE = "MODE_PROFILE";
	const MODE_PERMISSION_SET = "MODE_PERMISSION_SET";
	const MODE_USER_SUMMARY = "MODE_USER_SUMMARY";
	const MODE_PERMISSION_SET_GROUP_SUMMARY = "MODE_PERMISSION_SET_GROUP_SUMMARY";

	const TYPE_MUTE = "Mute";

	var timer;
	var viewType = null;
	var table = null;
	var profileTable = null;
	var userTable = null;
	var mode = MODE_PROFILE;

	var parser = new URL(window.location.href);

	var sfHost = null;
	var href = parser.searchParams.get("href");

	// かなり暫定
	var sid = null;

	// loading表示用の取得対象オブジェクト
	var queryTargetObject;

	var filterColumns = {};
	var targetObject = null;
	var profileFields = {};

	var endPoint = "/services/data/v55.0";
	var queryEndPoint = endPoint + "/query/";
	var toolingQueryEndPoint = endPoint + "/tooling/query/";
	var orgName = null;

	// profile id => Profile
	var profiles = {};
	// prmissionSet id => Profile
	var profilesForPermissionSet = {};
	// object API Name => Object label
	var sobjects = {};

	// apexPages ID => ApexClass
	var apexPages = {};

	// ApexClass ID => ApexClass
	var apexClasses = {};

	// tab name => TabDefinition
	var tabDefinitions = {};

	// app name => AppDefinition
	var appDefinitions = {};

//	var myDataTable = null;

	// layout ID => Layout
	var layouts = {};

//	var records = [];

//	var isProfileSelectorInitialized = false;

	// PermissionSet ID => label
	var permissionSetGroups = {};

	// User ID => User
	var users = {};

	// サマリ用
	var selectedUserId = null;
	var selectedPermissionSetId = null;

	function replaceText(cssSelector, text) {
		$(cssSelector).contents().filter(function() {
			return this.nodeType === 3 && this.nodeValue.trim() != '';
		}).first().replaceWith(text);
	}

	// Internationalization
	//TODO rewrite with modern library (ex. React.js)
	replaceText('#modeProfileOption', chrome.i18n.getMessage('Profile'));
	replaceText('#modePermissionSetOption', chrome.i18n.getMessage('PermissionSet'));
	replaceText('#modePermissionSetGroupSummaryOption', chrome.i18n.getMessage('PermissionSetGroupSummary'));
	replaceText('#modeUserSummaryOption', chrome.i18n.getMessage('UserSummary'));
	replaceText('#getSystemPermissionButton', chrome.i18n.getMessage('SystemPermission'));
	replaceText('#getObjectPermissionButton', chrome.i18n.getMessage('ObjectPermission'));
	replaceText('#getFieldPermissionButton', chrome.i18n.getMessage('FieldPermission'));
	replaceText('#getLayoutAssignButton', chrome.i18n.getMessage('LayoutAssign'));
	replaceText('#getClassAccessButton', chrome.i18n.getMessage('ClassAccess'));
	replaceText('#getPageAccessButton', chrome.i18n.getMessage('PageAccess'));
	replaceText('#getTabAccessButton', chrome.i18n.getMessage('TabAccess'));
	replaceText('#getAppAccessButton', chrome.i18n.getMessage('AppAccess'));
	replaceText('#getAccessRestrictionButton', chrome.i18n.getMessage('AccessRestriction'));
	replaceText('#getPermissionSetGroupButton', chrome.i18n.getMessage('PermissionSetGroup'));
	replaceText('#getPermissionSetAssignButton', chrome.i18n.getMessage('PermissionSetAssign'));
	replaceText('#searchCellsLabel', chrome.i18n.getMessage('Filter'));
	replaceText('#selectProfileButton', chrome.i18n.getMessage('SelectProfile'));
	replaceText('#exportExcel', chrome.i18n.getMessage('ExportExcel'));
	replaceText('#exportCsv', chrome.i18n.getMessage('ExportCsv'));
	$('#reload').attr('title', chrome.i18n.getMessage('ReloadTitle'));
	replaceText('#objectSelectorModal .header', chrome.i18n.getMessage('ObjectSelectorModalCaption'));
	replaceText('#selectCancelButton', chrome.i18n.getMessage('Cancel'));
	replaceText('#selectObjectButton', chrome.i18n.getMessage('Select'));
	replaceText('#selectOnlyHasActiveUser', chrome.i18n.getMessage('SelectOnlyHasActiveUser'));
	replaceText('#selectOnlyPermissionSetGroup', chrome.i18n.getMessage('SelectOnlyPermissionSetGroup'));
	replaceText('#resetProfileSelection', chrome.i18n.getMessage('ResetProfileSelection'));
	replaceText('#cancelProfileSelection', chrome.i18n.getMessage('Cancel'));
	replaceText('#applyProfileSelection', chrome.i18n.getMessage('Apply'));
	replaceText('#notApplied', chrome.i18n.getMessage('NotAppliedMessage'));
	replaceText('#userModalCloseButton', chrome.i18n.getMessage('Close'));

	$(".ui.dropdown").dropdown({ fullTextSearch: "exact", showOnFocus: false });
	$('.ui.checkbox').checkbox();

	function getLink(sfid) {
		return 'https://' + sfHost + '/' + sfid;
	}

	function getUserLink(sfid) {
		return 'https://' + sfHost + '/lightning/setup/ManageUsers/page?address=/' + sfid + '?noredirect=1';
	}

	function matchAny(data, filterParams){
		//data - the data for the row being filtered
		//filterParams - params object passed to the filter

		var match = false;

		for(var key in data){
			if(data[key] && data[key].toLowerCase().indexOf(filterParams.value.toLowerCase()) !== -1){
				match = true;
				break;
			}
		}

		return match;
	}

	$("#modeSelector").dropdown({
		"onChange": async function (value, text, selectedItem) {
			$("#loading").removeClass("hidden").addClass("active");
			viewType = null;
			filterColumns = {};

			$("#searchCells").val("");
			document.getElementById("counter").innerHTML = "";

			$("#exportExcel").addClass("disabled");
			$("#exportCsv").addClass("disabled");
			$("#reload").addClass("disabled");

			$("#mainButton > button").removeClass("disabled");
			$("#setSelector").hide();

			if (value == "profile") {
				mode = MODE_PROFILE;
				$("#getLayoutAssignButton").show();
				$("#getAccessRestrictionButton").show();
				$("#getPermissionSetGroupButton").hide();
				$("#getPermissionSetAssignButton").hide();
				$("#selectOnlyPermissionSetGroup").hide();
				$("#selectProfileButton").show();

				replaceText('#selectProfileButton', chrome.i18n.getMessage('SelectProfile'));
			} else if (value == "permissionSet") {
				mode = MODE_PERMISSION_SET;
				$("#getLayoutAssignButton").hide();
				$("#getAccessRestrictionButton").hide();
				$("#getPermissionSetGroupButton").show();
				$("#getPermissionSetAssignButton").show();
				$("#selectOnlyPermissionSetGroup").show();
				$("#selectProfileButton").show();

				replaceText('#selectProfileButton', chrome.i18n.getMessage('SelectPermissionSet'));
			} else {
				$("#getLayoutAssignButton").hide();
				$("#getAccessRestrictionButton").hide();
				$("#getPermissionSetGroupButton").hide();
				$("#getPermissionSetAssignButton").hide();
				$("#selectOnlyPermissionSetGroup").hide();
				$("#selectProfileButton").hide();

				$("#setSelector").show();

				$("#mainButton > button").addClass("disabled");

				if (value == "permissionSetGruopSummary") {
					mode = MODE_PERMISSION_SET_GROUP_SUMMARY;
				} else if (value == "userSummary") {
					mode = MODE_USER_SUMMARY;
				}
			}
			
			if (table) {
				table.destroy();
			}

			await getProfile();

			if (value == "permissionSetGruopSummary") {
				let items = [];

				Object.values(profiles).forEach(profile => {
					if (profile.type == "Group") {
						items.push({
							value: profile.id,
							name: `${profile.name}`
						});
					}
				});
		
				$("#setSelector").dropdown({ values: items, onChange: setSelected });
			} else if (value == "userSummary") {
				await getUsers();

				let items = [];

				Object.values(users).forEach(user => {
					items.push({
						value: user.id,
						name: `${user.name}<br /><span class="ui small blue text">${user.username}</span>`
					});
				});
		
				$("#setSelector").dropdown({ values: items, onChange: setSelected });
			}

			$("#loading").removeClass("active").addClass("hidden");
		}
	});

	function setSelected(value, text, selectedItem){
		$("#mainButton > button").removeClass("disabled");

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY) {
			selectedPermissionSetId = value;
		} else {
			selectedUserId = value;
		}

		if (table) {
			table.destroy();
		}
	}

	async function filterForSummary() {
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY) {
			filterColumns = {};

			// PermissionSetGroupへの割当取得
			queryTargetObject = 'PermissionSetGroupComponent';
			let records = await query(
				`select PermissionSetGroupId,PermissionSetId from PermissionSetGroupComponent where PermissionSetGroupId = '${profiles[selectedPermissionSetId].permissionSetGroupId}'`
			);
	
			let remainIds = {};

			records.forEach(record => {
				remainIds[record.PermissionSetId] = true;
			});

			// 権限セットグループ自身も追加しておく
			remainIds[selectedPermissionSetId] = true;

			let keys = Object.keys(profiles);

			keys.forEach(key => {
				if (! remainIds[profiles[key].id]) {
					filterColumns[profiles[key].id] = true;
				}
			});
		} else {
			filterColumns = {};

			//TODO ExpirationDateを見なくてよいか確認
			// PermissionSetへの割当取得
			queryTargetObject = 'PermissionSetAssignment';
			let records = await query(
				`select PermissionSetId from PermissionSetAssignment where AssigneeId= '${selectedUserId}' and IsActive = true`
			);

			let remainIds = {};

			records.forEach(record => {
				remainIds[record.PermissionSetId] = true;
			});

			queryTargetObject = 'User';
			records = await query(
				`select ProfileId from User where Id = '${selectedUserId}'`
			);

			// プロファイルの権限セットを追加しておく
			let profileId = records[0]?.ProfileId;

			queryTargetObject = 'PermissionSet';
			records = await query(
				`select Id from PermissionSet where ProfileId = '${profileId}'`
			);

			selectedPermissionSetId = records[0]?.Id;

			// プロファイルがないスペシャルユーザーもいるので、その場合はプロファイルIDは残しておかない
			if (selectedPermissionSetId) {
				remainIds[selectedPermissionSetId] = true;
			}

			let keys = Object.keys(profiles);

			keys.forEach(key => {
				if (! remainIds[profiles[key].id]) {
					filterColumns[profiles[key].id] = true;
				}
			});
		}
	}

	$("#searchCells").on("keyup", function () {
		if (viewType === null) {
			return;
		}
	
		var self = this;
		if (timer) { clearTimeout(timer); }
		timer = setTimeout(function () {
			table.setFilter(matchAny, {value: self.value});
		}, 100);
	});

	function getExportBaseFilename() {
		let result = orgName;

		switch (mode) {
			case MODE_PROFILE:
				// -プロファイル
				result += chrome.i18n.getMessage('ProfileFileSuffix');
				break;
			case MODE_PERMISSION_SET:
				// -権限セット
				result += chrome.i18n.getMessage('PermissionSetFileSuffix');
				break;
			case MODE_PERMISSION_SET_GROUP_SUMMARY:
				// -権限セット
				result += chrome.i18n.getMessage('PermissionSetGroupSummaryFileSuffix') + `(${profiles[selectedPermissionSetId].name})`;
				break;
			case MODE_USER_SUMMARY:
				// -権限セット
				result += chrome.i18n.getMessage('UserSummaryFileSuffix') + `(${users[selectedUserId].name})`;
				break;
		}			

		switch (viewType) {
			case VIEW_SYSTEM_PERMISSION:
				// -システム権限一覧
				result += chrome.i18n.getMessage('SystemPermissionFileSuffix');
				break;
			case VIEW_OBJECT_PERMISSION:
				// -オブジェクト権限一覧
				result += chrome.i18n.getMessage('ObjectPermissionFileSuffix');
				break;
			case VIEW_FIELD_PERMISSION:
				// -項目レベルセキュリティ一覧(objectName)
				result += chrome.i18n.getMessage('FieldPermissionFileSuffix') + `(${targetObject.label})`;
				break;
			case VIEW_LAYOUT_ASSIGN:
				// -レイアウト割り当て一覧
				result += chrome.i18n.getMessage('LayoutAssignFileSuffix');
				break;
			case VIEW_CLASS_ACCESS:
				// -クラスアクセス一覧
				result += chrome.i18n.getMessage('ClassAccessFileSuffix');
				break;
			case VIEW_PAGE_ACCESS:
				// -ページアクセス一覧
				result += chrome.i18n.getMessage('PageAccessFileSuffix');
				break;
			case VIEW_TAB_ACCESS:
				// -タブアクセス一覧
				result += chrome.i18n.getMessage('TabAccessFileSuffix');
				break;
			case VIEW_APP_ACCESS:
				// -アプリケーションアクセス一覧
				result += chrome.i18n.getMessage('AppAccessFileSuffix');
				break;
			case VIEW_ACCESS_RESTRICTION:
				// -アクセス制限一覧
				result += chrome.i18n.getMessage('AccessRestrictionFileSuffix');
				break;
			case VIEW_PERMISSION_SET_GROUP:
				// -権限セットグループ一覧
				result += chrome.i18n.getMessage('PermissionSetGroupFileSuffix');
				break;
			case VIEW_PERMISSION_SET_ASSIGN:
				// -権限セット割り当て一覧
				result += chrome.i18n.getMessage('PermissionSetAssignFileSuffix');
				break;
		}

		return result;
	}

	$("#clearSearchCells").click(() => {
		$("#searchCells").val("");
		$("#searchCells").keyup();
	});

	$("#exportExcel").on("click", function () {
		let exportFilename = getExportBaseFilename() + ".xlsx";

		let table = Tabulator.findTable("#tabulator")[0];
		table.download("xlsx", exportFilename);
	});

	$("#exportCsv").on("click", function () {
		let exportFilename = getExportBaseFilename() + ".csv";

		let table = Tabulator.findTable("#tabulator")[0];
		table.download("csv", exportFilename, {bom:true});
	});

	$("#reload").on("click", function () {
		switch (viewType) {
			case VIEW_SYSTEM_PERMISSION:
				$("#getSystemPermissionButton").click();
				break;
			case VIEW_OBJECT_PERMISSION:
				$("#getObjectPermissionButton").click();
				break;
			case VIEW_FIELD_PERMISSION:
				$("#loading").removeClass("hidden").addClass("active");
				$("#selectObjectButton").click();
				break;
			case VIEW_LAYOUT_ASSIGN:
				$("#getLayoutAssignButton").click();
				break;
			case VIEW_CLASS_ACCESS:
				$("#getClassAccessButton").click();
				break;
			case VIEW_PAGE_ACCESS:
				$("#getPageAccessButton").click();
				break;
			case VIEW_TAB_ACCESS:
				$("#getTabAccessButton").click();
				break;
			case VIEW_APP_ACCESS:
				$("#getAppAccessButton").click();
				break;
			case VIEW_ACCESS_RESTRICTION:
				$("#getAccessRestrictionButton").click();
				break;
			case VIEW_PERMISSION_SET_GROUP:
				$("#getPermissionSetGroupButton").click();
				break;
			case VIEW_PERMISSION_SET_ASSIGN:
				$("#getPermissionSetAssignButton").click();
				break;
		}
	});

	// プロファイルフィルタ
	$("#selectProfileButton").click(function () {
		$("#profileSelectorModal").modal({
			allowMultiple: true,
			onVisible: () => {
				// redrawしないと高さ計算がずれる
				profileTable.redraw();
			}
		}).modal('show');
	});

	// ユーザがいるプロファイルのみチェック
	$("#selectOnlyHasActiveUser").click(function () {
		profileTable.deselectRow();
		
		profileTable.selectRow(profileTable.getRows().filter(
			row => row.getData()["activeUserCount"] > 0
		));

		$("#notApplied").show();
	});

	// 権限セットグループのみチェック
	$("#selectOnlyPermissionSetGroup").click(function () {
		profileTable.deselectRow();
		
		profileTable.selectRow(profileTable.getRows().filter(
			row => row.getData()["type"] == "Group"
		));

		$("#notApplied").show();
	});

	$("#applyProfileSelection").click(function (event) {
		$("#notApplied").hide();
		$(event.target).find("i").removeClass("search").addClass("spinner loading");

		new Promise((resolve, reject) => {
			setTimeout(() => {
				filterColumns = {};
				
				profileTable.getRows().forEach( x => {
					if (! x.isSelected()) {
						filterColumns[x.getData().profileId] = true;
					}
				});

				redraw();

				resolve();
			}, 100);
		}).then(() => {
			$(event.target).find("i").removeClass("spinner loading").addClass("search");

			$("#profileSelectorModal").modal('hide');
			$("#searchCells").keyup();
		});
	});

	$("#resetProfileSelection").click(function () {
		profileTable.deselectRow();

		profileTable.selectRow(profileTable.getRows().filter(
			row => ! filterColumns[row.getData().profileId]
		));

		$("#notApplied").hide();
	});

	$(document).on("click", ".showUsers", async function(e) {
		//TODO リファクタリング
		let records;
		let colModel;
		let datas = [];

		if (mode == MODE_PROFILE) {
			queryTargetObject = 'User';
			records = await query(
				`select Id, Username, Name, IsActive from User where ProfileId = '${e.target.dataset.id}'`
			);
	
			colModel = [
				{ title: '', vertAlign: "middle", field: 'link', width: 15, formatter:"html", headerSort: false },
				// 名前
				{ title: chrome.i18n.getMessage('Name'), vertAlign: "middle", field: 'name', width: 200, tooltip: true },
				// ユーザ名
				{ title: chrome.i18n.getMessage('Username'), vertAlign: "middle", field: 'userName', width: 300, tooltip: true },
				// アクティブ
				{ title: chrome.i18n.getMessage('Active'), vertAlign: "middle", field: 'isActive', width: 120, tooltip: true },
			];
	
			// ユーザ一覧生成
			records.forEach(user => {
				let data = {};
				data['link'] = `<a href="${getUserLink(user.Id)}" target="_blank"><i class="icon external alternate"></i></a>`;
				data['name'] = user.Name;
				data['userName'] = user.Username;
				data['isActive'] = user.IsActive;

				datas.push(data);
			});
		} else {
			queryTargetObject = 'PermissionSetAssignment';
			records = await query(
				`select Assignee.Id,Assignee.Username,Assignee.Name,Assignee.IsActive,ExpirationDate from PermissionSetAssignment where PermissionSetId	= '${e.target.dataset.id}'`
			);
	
			colModel = [
				{ title: '', vertAlign: "middle", field: 'link', width: 15, formatter:"html", headerSort: false },
				// 名前
				{ title: chrome.i18n.getMessage('Name'), vertAlign: "middle", field: 'name', width: 200, tooltip: true },
				// ユーザ名
				{ title: chrome.i18n.getMessage('Username'), vertAlign: "middle", field: 'userName', width: 300, tooltip: true },
				// アクティブ
				{ title: chrome.i18n.getMessage('Active'), vertAlign: "middle", field: 'isActive', width: 120, tooltip: true },
				// 有効期限
				{ title: chrome.i18n.getMessage('ExpiresOn'), vertAlign: "middle", field: 'expirationDate', width: 250, tooltip: true },
			];
	
			// ユーザ一覧生成
			records.forEach(permissionSetAssignment => {
				let data = {};
				data['link'] = `<a href="${getUserLink(permissionSetAssignment.Assignee.Id)}" target="_blank"><i class="icon external alternate"></i></a>`;
				data['name'] = permissionSetAssignment.Assignee.Name;
				data['userName'] = permissionSetAssignment.Assignee.Username;
				data['isActive'] = permissionSetAssignment.Assignee.IsActive;
				data['expirationDate'] = permissionSetAssignment.ExpirationDate;

				datas.push(data);
			});
		}

		if (userTable) {
			userTable.destroy();
		}

		userTable = new Tabulator("#userTable", {
			height: 500,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
			renderVertical: "basic",
		});

		$("#userModal").modal({
			allowMultiple: true,
			onVisible: () => {
				// redrawしないと高さ計算がずれる
				userTable.redraw();
			},
		}).modal('show');
	});

	// 初期表示
	(async() => {
		try {
			// ホストの取得
			await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage({ message: "getSfHost", url: href }, tempSfHost => {
					if (tempSfHost) {
						sfHost = tempSfHost;

						$("#hostname i").after(sfHost);

						resolve();
					} else {
						// ホストが取得できません。ブラウザでSalesforceにログインし直してから拡張を再オープンしてください
						reject(new Error(chrome.i18n.getMessage('NoHostErrorMessage')));
					}
				})
			});

			// セッションの取得(sessionidにセットされる)
			await sfConn.getSession(sfHost);

			if (! sessionid) {
				// セッションが取得できません。ブラウザでSalesforceにログインし直してから拡張を再オープンしてください
				throw new Error(chrome.i18n.getMessage('NoSessionErrorMessage'));
			}

			sid = sessionid;

			authorizationHeader = {
				'Authorization': 'Bearer ' + sid
			};

			// 組織情報取得
			queryTargetObject = 'Organization';
			let records = await query(
				'select Id, Name, IsSandbox from Organization'
			);
			
			orgName = records[0].Name;
			$("#orgInfo i").after(`${orgName}(${records[0].Id})`);

			// ユーザ情報取得
			let response = await sfConn.rest("/services/oauth2/userinfo");
			$("#userInfo i").after(`${response.name}(${response.preferred_username})`);

			// 起動時にプロファイル一覧は取る
			//await getProfile();

			// モード切替を動かしておく
			$("#modeSelector").dropdown("set selected", "profile");
		} catch (err) {
			alert(err.message);
			//TODO 初期化のタイミング用のエラーメッセージを作るか、通信エラーと共通メッセージ表示するか決める
			// 通信エラーが発生した場合は動作停止
			throw err;
		}
	})();

	class Sobject {
		constructor(name, label) {
			this.name = name;
			this.label = label;
			// field API Name => Field
			this.fields = {};
			// RecordType ID => RecordType
			this.recordTypes = {};
		}
	}

	class RecordType {
		constructor(id, name, label) {
			this.id = id;
			this.name = name;
			this.label = label;
		}
	}

	class Field {
		constructor(name, label, type, isNillable) {
			this.name = name;
			this.label = label;
			this.type = type;
			this.isNillable = isNillable;
		}
	}

	class Profile {
		constructor(id, name, licenseName) {
			this.id = id;
			this.name = name;
			this.licenseName = licenseName;
			this.permissionSetId = null;
			// 権限セットグループの場合のみセット。権限セットグループは、権限セットIDと権限セットグループIDの2つのIDを持つ
			this.permissionSetGroupId = null;
			// field API Name => boolean
			this.profilePermissions = {};
			// object API Name => ObjectPermission
			this.objectPermissions = {};
			//TODO 将来的に複数オブジェクト入れるならここは見直す
			// field API Name => FieldPermission
			this.fieldPermissions = {};
			// class ID => ApexClass
			this.classAccesses = {};
			// page ID => ApexPage
			this.pageAccesses = {};
			// tab name => Visibility String(DefaultOn or DefaultOff)
			this.tabAccesses = {};
			// app ID => AppDefinition
			this.appAccesses = {};
			// Object API Name + RecordType ID => Layout
			this.layoutAssigns = {};
			// Permission Set Group Id => boolean (Permission SetのIDではなくPermission Set GroupのIDなので注意)
			this.permissionSetGroups = {};
			// タイプ(権限セットの場合のみ利用)
			this.type = null;
			// 有効ユーザ数
			this.activeUserCount = 0;
			// 無効ユーザ数
			this.inactiveUserCount = 0;
			// 割当ユーザ
			this.users = [];
			// 許可IP
			this.loginIpRanges = [];
			// 日曜日ログイン開始時間
			this.sundayStart = null;
			// 日曜日ログイン終了時間
			this.sundayEnd = null;
			// 月曜日ログイン開始時間
			this.mondayStart = null;
			// 月曜日ログイン終了時間
			this.mondayEnd = null;
			// 火曜日ログイン開始時間
			this.tuesdayStart = null;
			// 火曜日ログイン終了時間
			this.tuesdayEnd = null;
			// 水曜日ログイン開始時間
			this.wednesdayStart = null;
			// 水曜日ログイン終了時間
			this.wednesdayEnd = null;
			// 木曜日ログイン開始時間
			this.thursdayStart = null;
			// 木曜日ログイン終了時間
			this.thursdayEnd = null;
			// 金曜日ログイン開始時間
			this.fridayStart = null;
			// 金曜日ログイン終了時間
			this.fridayEnd = null;
			// 土曜日ログイン開始時間
			this.saturdayStart = null;
			// 土曜日ログイン終了時間
			this.saturdayEnd = null;
		}
	}

	class User {
		constructor(id, name, username, isActive) {
			this.id = id;
			this.name = name;
			this.username = username;
			this.isActive = isActive;
		}
	}

	class ObjectPermission {
		constructor(sobjectType, canCreate, canRead, canEdit, canDelete, canViewAll, canModifyAll) {
			this.sobjectType = sobjectType;
			this.canCreate = canCreate;
			this.canRead = canRead;
			this.canEdit = canEdit;
			this.canDelete = canDelete;
			this.canViewAll = canViewAll;
			this.canModifyAll = canModifyAll;
		}
	}

	class FieldPermission {
		constructor(sObjectName, fieldName, canRead, canEdit) {
			this.sObjectName = sObjectName;
			this.fieldName = fieldName;
			this.canRead = canRead;
			this.canEdit = canEdit;
		}
	}

	class ApexPage {
		constructor(id, name, label) {
			this.id = id;
			this.name = name;
			this.label = label;
		}
	}

	class ApexClass {
		constructor(id, name) {
			this.id = id;
			this.name = name;
		}
	}

	class TabDefinition {
		constructor(name, label) {
			this.name = name;
			this.label = label;
		}
	}

	class AppDefinition {
		constructor(id, name, label) {
			this.id = id;
			this.name = name;
			this.label = label;
		}
	}

	class LoginIpRange {
		constructor(startIp, endIp, description) {
			this.startIp = startIp;
			this.endIp = endIp;
			this.description = description;
		}
	}

	class Layout {
		constructor(id, name, objectName, objectLabel) {
			this.id = id;
			this.name = name;
			this.objectName = objectName;
			this.objectLabel = objectLabel;
		}
	}

	async function batchGet(pr, records) {
		let response = await pr;
		
		records.push(...response.records);

		// loading状況表示
		$("#currentRecordCount").text(records.length);
		$("#totalRecordCount").text(response.totalSize);

		if (! response.done) {
			await batchGet(sfConn.rest(response.nextRecordsUrl), records);
		}
	}

	async function query(query, isTooling = false) {
		let records = [];

		let thisEndPoint = queryEndPoint;

		if (isTooling) {
			thisEndPoint = toolingQueryEndPoint;
		}

		// loading状況表示
		$("#loadingObject").text(queryTargetObject);
		$("#currentRecordCount").text('0');
		$("#totalRecordCount").text('----');

		try {
			await batchGet(
				sfConn.rest(thisEndPoint + "?q=" + encodeURIComponent(query)),
				records
			);
		} catch (err) {
			alert(chrome.i18n.getMessage('ConnectionErrorMessage') + "\n" + err.message);
			// 通信エラーが発生した場合は動作停止
			throw err;
		}
		
		return records;
	}

	async function getProfile() {
		let records;
		if (mode == MODE_PROFILE) {
			// Profileの取得
			queryTargetObject = 'Profile';
			records = await query(
				"select Id,Name,UserLicense.MasterLabel from Profile"
			);

			profiles = {};
			records.forEach(record => profiles[record.Id] = new Profile(record.Id, record.Name, record.UserLicense.MasterLabel));

			let keys = "'" + Object.keys(profiles).join("','") + "'";

			// 有効・無効ユーザ数の取得
			queryTargetObject = 'User';
			records = await query(
				"select count(Id) cnt,ProfileId,IsActive from User where ProfileId in (" + keys + ") group by ProfileId,IsActive"
			)
			
			records.forEach(record => {
				if (record.IsActive) {
					profiles[record.ProfileId].activeUserCount = record.cnt;
				} else {
					profiles[record.ProfileId].inactiveUserCount = record.cnt;
				}
			});
		} else {
			// PermissionSetの取得
			if (mode == MODE_USER_SUMMARY && selectedPermissionSetId) {
				queryTargetObject = 'PermissionSet';
				records = await query(
					`select Id,Label,License.Name,Type,PermissionSetGroupId,Profile.Name from PermissionSet where ProfileId = null or Id = '${selectedPermissionSetId}'`
				);
			} else {
				queryTargetObject = 'PermissionSet';
				records = await query(
					"select Id,Label,License.Name,Type,PermissionSetGroupId from PermissionSet where ProfileId = null"
				);
			}

			profiles = {};
			permissionSetGroups = {};
			records.forEach(record => {
				profiles[record.Id] = new Profile(record.Id, record.Label, record.License?.Name)
				// PermissionSetの場合は、プロファイル->権限セットの紐づけや権限セットIDのセットをここでやっておく
				profiles[record.Id].permissionSetId = record.Id;
				profiles[record.Id].permissionSetGroupId = record.PermissionSetGroupId;
				profilesForPermissionSet[record.Id] = profiles[record.Id];
				profiles[record.Id].type = record.Type;

				if (record.Type == "Group") {
					permissionSetGroups[record.PermissionSetGroupId] = record.Label;
				}

				// ユーザーサマリ用にプロファイルを取った場合は、名前を上書き
				if (record.Type == "Profile") {
					profiles[record.Id].name = record.Profile.Name;
				}
			});

			let keys = "'" + Object.keys(profiles).join("','") + "'";

			// 有効・無効ユーザ数の取得
			queryTargetObject = 'PermissionSetAssignment';
			records = await query(
				"select count(Id) cnt,PermissionSetId,IsActive from PermissionSetAssignment where PermissionSetId in (" + keys + ") group by PermissionSetId,IsActive"
			)
			
			records.forEach(record => {
				if (record.IsActive) {
					profiles[record.PermissionSetId].activeUserCount = record.cnt;
				} else {
					profiles[record.PermissionSetId].inactiveUserCount = record.cnt;
				}
			});

			// MutingPermissionSetの取得
			// MutingPermissionSetは直接ユーザーに割り当てられないので、ユーザーは0のままでよし
			queryTargetObject = 'MutingPermissionSet';
			records = await query(
				"select Id,MasterLabel from MutingPermissionSet"
			);

			records.forEach(record => {
				//TODO 暫定。ライセンス扱いにするか、タイプに表示するか決める
				profiles[record.Id] = new Profile(record.Id, record.MasterLabel, "---- Muting Permission ----")
				// PermissionSetの場合は、プロファイル->権限セットの紐づけや権限セットIDのセットをここでやっておく
				profiles[record.Id].permissionSetId = record.Id;
				profilesForPermissionSet[record.Id] = profiles[record.Id];
				profiles[record.Id].type = TYPE_MUTE;
			});

			// PermissionSetGroupへの割当取得
			queryTargetObject = 'PermissionSetGroupComponent';
			records = await query(
				"select PermissionSetGroupId,PermissionSetId from PermissionSetGroupComponent"
			);
	
			records.forEach(record => {
				let permissionSetGroups = profiles[record.PermissionSetId].permissionSetGroups;
				permissionSetGroups[record.PermissionSetGroupId] = true;
			});
	
		}

		let activeUserIcon = '<i class="user icon"></i>';
		let inactiveUserIcon = '<i class="user outline icon"></i>';

		let profileNameColumnTitle;
		if (mode == MODE_PROFILE) {
			// プロファイル名
			profileNameColumnTitle = chrome.i18n.getMessage('ProfileName');
		} else {
			// 権限セット名
			profileNameColumnTitle = chrome.i18n.getMessage('PermissionSetName');
		}

		let labelWidth = mode == MODE_PERMISSION_SET ? 310 : 490;

		let colModel = [
			{ formatter:"rowSelection", titleFormatter:"rowSelection", hozAlign:"center", vertAlign: "middle", headerSort:false,
				cellClick:function(e, cell) {
					cell.getRow().toggleSelect();
				}
			},
			{ title: '', vertAlign: "middle", field: 'link', width: 15, formatter: "html", headerSort: false},
			{ title: profileNameColumnTitle, vertAlign: "middle", field: 'label', width: labelWidth, tooltip: true,
				cellClick:function(e, cell) {
					cell.getRow().toggleSelect();
				}
			}
		]

		// 権限セットの場合だけタイプ・グループ数追加
		if (mode == MODE_PERMISSION_SET) {
			colModel = colModel.concat([
				{ title: chrome.i18n.getMessage('Group'), field: 'type', width: 90, hozAlign: "center",
					formatter: function(cell, formatterParams, onRendered){
						return cell.getValue() == "Group" ? chrome.i18n.getMessage('ShortYes') : '';
					},
					cellClick:function(e, cell) {
						cell.getRow().toggleSelect();
					},
				},
				{ title: chrome.i18n.getMessage('GroupCount'), field: 'groupCount', width: 90, hozAlign: "center",
					cellClick:function(e, cell) {
						cell.getRow().toggleSelect();
					},
				},
			]);
		}

		colModel = colModel.concat([
			// 有効ユーザ
			{ title: chrome.i18n.getMessage('ActiveUser'), field: 'activeUserCount', width: 110, hozAlign: "center", bottomCalc:"sum",
				formatter: function(cell, formatterParams, onRendered){
					let icon = cell.getValue() > 0 ? activeUserIcon : inactiveUserIcon;

					// ～人
					return icon + cell.getValue() + chrome.i18n.getMessage('UserCounteSuffix');
				},
				cellClick:function(e, cell) {
					cell.getRow().toggleSelect();
				},
			},
			// 無効ユーザ
			{ title: chrome.i18n.getMessage('InactiveUser'), field: 'inactiveUserCount', width: 110, hozAlign: "center", bottomCalc: "sum",
				formatter: function(cell, formatterParams, onRendered){
					let icon = cell.getValue() > 0 ? activeUserIcon : inactiveUserIcon;

					// ～人
					return icon + cell.getValue() + chrome.i18n.getMessage('UserCounteSuffix');
				},
				cellClick:function(e, cell) {
					cell.getRow().toggleSelect();
				},
			},
			// ユーザ一覧
			{ title: chrome.i18n.getMessage('UserList'), field: 'users', width: 110, hozAlign: "center",
				formatter: function(cell, formatterParams, onRendered){
					// ユーザ数が0でない場合は一覧用ボタンを表示
					return cell.getValue().isShow ? `<a data-id="${cell.getValue().profileId}" class="showUsers ui teal small label" type="button">${chrome.i18n.getMessage('View')}</a>` : '';
				}
			},
		]);

		let datas = [];

		// プロファイルチェックボックス生成
		Object.values(profiles).forEach(profile => {
			let data = {};
			data['profileId'] = profile.id;
			data['link'] = `<a href="${getLink(profile.id)}" target="_blank"><i class="icon external alternate"></i></a>`;
			data['label'] = profile.name;
			data['profileUrl'] = getLink(profile.id);
			data['type'] = profile.type;
			data['groupCount'] = Object.keys(profile.permissionSetGroups).length;
			data['activeUserCount'] = profile.activeUserCount;
			data['inactiveUserCount'] = profile.inactiveUserCount;
			data['licenseName'] = profile.licenseName;
			data['users'] = {isShow: profile.activeUserCount + profile.inactiveUserCount > 0, profileId: profile.id};

			datas.push(data);
		});

		var tempSelectedProfileIds = {};
		var isSkipSelectEvent = false;

		if (profileTable) {
			profileTable.destroy();
		}

		profileTable = new Tabulator("#profileSelector", {
			height: 600,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
			groupBy: "licenseName",
			groupToggleElement: false,
			/*TODO group all select/deselect
			groupHeader: function(value, count, data, group){
				return "<input type='checkbox' />" + value + "<span style='color:#d00; margin-left:10px;'>(" + count + " item)</span>";
			},
			*/
			selectableCheck : function(row) {
				return row.getData()['label'] != null;
			},
		});

		var selectedCount = 0;

		profileTable.on("tableBuilt", function(){
//			profileTable.selectRow();
			profileTable.on("rowSelectionChanged", function(data, rows){
				// work around
				let tempCount = data.filter(x => x.label != undefined).length;
				
				if (selectedCount != tempCount) {
					$("#notApplied").show();
					let element = document.getElementById("selectedProfileCounter");
					// ～件 選択中
					element.innerHTML = rows.length + chrome.i18n.getMessage('SelectedProfileCounterSuffix');
					selectedCount = tempCount;
				}
			});
			$("#resetProfileSelection").click();
		});
	}

	// require getProfiles
	async function getPermissionSet() {
		// プロファイルモードのときだけ実行
		if (mode != MODE_PROFILE) {
			return;
		}

		let keys = "'" + Object.keys(profiles).join("','") + "'";

		queryTargetObject = 'PermissionSet';
		let records = await query(
			"select Id,ProfileId from PermissionSet where ProfileId in (" + keys + ")"
		);
		
		profilesForPermissionSet = {}

		records.forEach(record => {
			profiles[record.ProfileId].permissionSetId = record.Id;
			profilesForPermissionSet[record.Id] = profiles[record.ProfileId];
		});
	}

	async function getEntityDefinition() {
		queryTargetObject = 'EntityDefinition';
		let records = await query(
			"select QualifiedApiName,Label from EntityDefinition where IsCustomizable=true and IsCompactLayoutable=true"
		);
		
		sobjects = {};
		records.forEach(record => sobjects[record.QualifiedApiName] = new Sobject(record.QualifiedApiName, record.Label));
	}

	// require getPermissionSet
	async function getSystemPermission() {
		profileFields = {};
		
		// 権限種類一覧の取得
		let response = null;
		try {
			response = await sfConn.rest(endPoint + "/sobjects/PermissionSet/describe/");
		} catch (err) {
			alert(chrome.i18n.getMessage('ConnectionErrorMessage') + "\n" + err.message);
			// 通信エラーが発生した場合は動作停止
			throw err;
		}

		response.fields.forEach( x => {
			if (x.name.startsWith('Permissions')) {
				profileFields[x.name] = x.label;
			}
		});
		
		// 権限セットの取得
		let fieldKeys = Object.keys(profileFields);
		let fields = fieldKeys.join(",");

		let records;
		// ProfileIdでwhere inするとクエリサイズ制限を超えるため全件取得
		if (mode == MODE_PROFILE) {
			queryTargetObject = 'PermissionSet';
			records = await query(
				"select ProfileId, " + fields + " from PermissionSet where ProfileId != null"
			);

			records.forEach(record => {
				if (profiles[record.ProfileId]) {
					let profilePermissions = profiles[record.ProfileId].profilePermissions;
					
					fieldKeys.forEach(key => {
						profilePermissions[key] = record[key];
					});
				}
			});
		} else {
			// 通常権限セット
			if (MODE_USER_SUMMARY && selectedPermissionSetId) {
				// ユーザサマリでプロファイルがあるユーザはプロファイルの権限も一緒に取得
				queryTargetObject = 'PermissionSet';
				records = await query(
					"select Id, " + fields + ` from PermissionSet where ProfileId = null or Id ='${selectedPermissionSetId}'`
				);
			} else {
				queryTargetObject = 'PermissionSet';
				records = await query(
					"select Id, " + fields + " from PermissionSet where ProfileId = null"
				);
			}

			records.forEach(record => {
				if (profiles[record.Id]) {
					let profilePermissions = profiles[record.Id].profilePermissions;
					
					fieldKeys.forEach(key => {
						profilePermissions[key] = record[key];
					});
				}
			});

			// ミュート権限セット
			queryTargetObject = 'MutingPermissionSet';
			records = await query(
				"select Id, " + fields + " from MutingPermissionSet"
			);

			records.forEach(record => {
				if (profiles[record.Id]) {
					let profilePermissions = profiles[record.Id].profilePermissions;
					
					fieldKeys.forEach(key => {
						profilePermissions[key] = record[key];
					});
				}
			});
		}
	}

	// require getPermissionSet
	async function getObjectPermission() {
		let keys = "'" + Object.values(profiles).map(x => x.permissionSetId).join("','") + "'";

		// オブジェクト権限の取得
		queryTargetObject = 'ObjectPermissions';
		let records = await query(
			"select ParentId,SobjectType,PermissionsCreate,PermissionsRead,PermissionsEdit,PermissionsDelete,PermissionsViewAllRecords,PermissionsModifyAllRecords from ObjectPermissions where ParentId in (" + keys + ")"
		);

		records.forEach(record => {
			let objectPermissions = profilesForPermissionSet[record.ParentId].objectPermissions;
			objectPermissions[record.SobjectType] =
				new ObjectPermission(
					record.SobjectType,
					record.PermissionsCreate,
					record.PermissionsRead,
					record.PermissionsEdit,
					record.PermissionsDelete,
					record.PermissionsViewAllRecords,
					record.PermissionsModifyAllRecords
				);
		});
	}

	// require getPermissionSet && set targetObject
	async function getFieldPermission() {
		let keys = "'" + Object.values(profiles).map(x => x.permissionSetId).join("','") + "'";

		queryTargetObject = 'FieldPermissions';
		let records = await query(
			`select ParentId, Field, SobjectType, PermissionsEdit, PermissionsRead from FieldPermissions where SobjectType ='${targetObject.name}' and ParentId in (${keys})`
		);

		records.forEach(record => {
			let fieldPermissions = profilesForPermissionSet[record.ParentId].fieldPermissions;
			// Fieldはオブジェクト名.フィールド名
			let fieldName = record.Field.replace(targetObject.name + '.', '');

			fieldPermissions[fieldName] = new FieldPermission(record.SobjectType, fieldName, record.PermissionsRead, record.PermissionsEdit);
		});
	}

	// require getPermissionSet && set targetObject
	async function getFieldDefinition() {
		queryTargetObject = 'FieldDefinition';
		let records = await query(
			`select EntityDefinitionId,MasterLabel,IsNillable, QualifiedApiName, DataType from FieldDefinition where EntityDefinition.QualifiedApiName ='${targetObject.name}'`,
			true
		);

		targetObject.fields = [];

		records.forEach(record => {
			targetObject.fields[record.QualifiedApiName] =
				new Field(record.QualifiedApiName, record.MasterLabel, record.DataType, record.IsNillable);
		});
	}

	async function getApexClass() {
		queryTargetObject = 'ApexClass';
		let records = await query(
			"select Id,Name from ApexClass"
		);

		apexClasses = {};

		records.forEach(record => {
			apexClasses[record.Id] = new ApexClass(record.Id, record.Name);
		});
	}

	async function getApexPage() {
		queryTargetObject = 'ApexPage';
		let records = await query(
			"select Id,Name,MasterLabel from ApexPage"
		);

		apexPages = {};
		records.forEach(record => {
			apexPages[record.Id] = new ApexPage(record.Id, record.Name, record.MasterLabel);
		});
	}

	async function getTabDefinition() {
		queryTargetObject = 'TabDefinition';
		let records = await query(
			"select Name, Label from TabDefinition",
			true
		);

		tabDefinitions = {};
		records.forEach(record => {
			tabDefinitions[record.Name] = new TabDefinition(record.Name, record.Label);
		});
	}

	async function getAppDefinition() {
		queryTargetObject = 'CustomApplication';
		let records = await query(
			"select Id, DeveloperName,Label,NamespacePrefix from CustomApplication",
			true
		);

		appDefinitions = {};
		records.forEach(record => {
			let name = record.NamespacePrefix + '__' + record.DeveloperName;
			appDefinitions[record.Id] = new AppDefinition(record.Id, name, record.Label);
		});
	}

	// require getPermissionSet
	// type is 'ApexClass' or 'ApexPage' or 'TabSet'
	async function getSetupEntityAccess(type) {
		let keys = "'" + Object.values(profiles).map(x => x.permissionSetId).join("','") + "'";

		queryTargetObject = 'SetupEntityAccess';
		let records = await query(
			`select ParentId, SetupEntityType, SetupEntityId from SetupEntityAccess where SetupEntityType ='${type}' and ParentId in (${keys})`
		);

		if (type == 'ApexClass') {
			records.forEach(record => {
				let classAccesses = profilesForPermissionSet[record.ParentId].classAccesses;
				classAccesses[record.SetupEntityId] = apexClasses[record.SetupEntityId];
			});
		} else if (type == 'ApexPage') {
			records.forEach(record => {
				let pageAccesses = profilesForPermissionSet[record.ParentId].pageAccesses;
				pageAccesses[record.SetupEntityId] = apexPages[record.SetupEntityId];
			});
		} else {
			records.forEach(record => {
				let appAccesses = profilesForPermissionSet[record.ParentId].appAccesses;
				appAccesses[record.SetupEntityId] = appDefinitions[record.SetupEntityId];
			});
		}
	}

	// require getPermissionSet
	async function getPermissionSetTabSetting() {
		let keys = "'" + Object.values(profiles).map(x => x.permissionSetId).join("','") + "'";

		queryTargetObject = 'PermissionSetTabSetting';
		let records = await query(
			`select ParentId, Name, Visibility from PermissionSetTabSetting where ParentId in (${keys})`
		);

		records.forEach(record => {
			let tabAccesses = profilesForPermissionSet[record.ParentId].tabAccesses;
			tabAccesses[record.Name] = record.Visibility;
		});
	}

	async function getLayout() {
		queryTargetObject = 'Layout';
		let records = await query(
			"select Id, Name, EntityDefinition.QualifiedApiName, EntityDefinition.Label from Layout where EntityDefinition.IsCustomizable=true and EntityDefinition.IsCompactLayoutable=true",
			true
		);
		
		layouts = {}

		records.forEach(record => {
			layouts[record.Id] = new Layout(record.Id, record.Name, record.EntityDefinition.QualifiedApiName, record.EntityDefinition.Label);
		});
	}

	// require getEntityDefinition
	async function getRecordType() {
		queryTargetObject = 'RecordType';
		let records = await query(
			"select Id, DeveloperName, Name, SobjectType from RecordType"
		);
		
		records.forEach(record => {
			sobjects[record.SobjectType].recordTypes[record.Id] = new RecordType(record.Id, record.DeveloperName, record.Name);
		});
	}

	// require getProfiles
	// require getLayout
	async function getLayoutAssign() {
		// レイアウトは権限セットではなくプロファイルに直接紐づくので権限セットキーは作らない
		// レイアウトIDで絞ると多少取得レコード数が減るが、Queryが長くなるリスクのほうが高いので全レイアウト分取得

		queryTargetObject = 'ProfileLayout';
		let records = await query(
			`select Profile.Id, LayoutId, RecordTypeId from ProfileLayout where Profile.Id != null`,
			true
		);
		
		// tooling APIのfrom ProfileLayoutのクエリ結果ではEntityDefinition経由の情報が欠けるため、オブジェクト名などは事前取得したLayoutから取る
		
		records.forEach(record => {
			if (layouts[record.LayoutId]) {
				profiles[record.Profile.Id].layoutAssigns[layouts[record.LayoutId].objectName + record.RecordTypeId] = layouts[record.LayoutId];
			}
		});
	}

	// require getProfiles
	async function getPermissionSetAssignment() {
		let keys = "'" + Object.values(profiles).map(x => x.permissionSetId).join("','") + "'";

		queryTargetObject = 'PermissionSetAssignment';
		let records = await query(
			"select AssigneeId,PermissionSetId from PermissionSetAssignment where IsActive = true and PermissionSetId in (" + keys + ")"
		)

		records.forEach(record => {
			profiles[record.PermissionSetId].users[record.AssigneeId] = true;
		});
	}

	async function getUsers() {
		queryTargetObject = 'User';
		let records = await query(
			`select Id,Name,Username,IsActive,ProfileId from User`
		);

		records.forEach(record => {
			users[record.Id] = new User(record.Id, record.Name, record.Username, record.IsActive);
		});
	}

	$("#getSystemPermissionButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// システム権限
		$("#viewInfo").text(chrome.i18n.getMessage('SystemPermission')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getProfile();
		await getPermissionSet();
		await getSystemPermission();

		let isResetSearchCells = true;
		if (viewType == VIEW_SYSTEM_PERMISSION) {
			isResetSearchCells = false;
		}

		viewType = VIEW_SYSTEM_PERMISSION;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}
	});

	$("#getObjectPermissionButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// オブジェクト権限
		$("#viewInfo").text(chrome.i18n.getMessage('ObjectPermission')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getProfile();
		await getPermissionSet();
		await getEntityDefinition();
		await getObjectPermission();

		let isResetSearchCells = true;
		if (viewType == VIEW_OBJECT_PERMISSION) {
			isResetSearchCells = false;
		}

		viewType = VIEW_OBJECT_PERMISSION;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}
	});

	$("#getFieldPermissionButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");

		await getEntityDefinition();

		let items = [];

		Object.values(sobjects).forEach(sobject => {
			items.push({
				value: sobject.name,
				name: `${sobject.label} (${sobject.name})`
			});
		});

		$("#objectSelector").dropdown({
			values: items,
			onChange: function() {
				$("#selectObjectButton").removeClass("disabled");
			}
		});

		// 選択ボタンを無効化
		$("#selectObjectButton").addClass("disabled");

		$("#objectSelectorModal").modal("setting", {
			autofocus: true,
			closable: false,
			onDeny: function () {
				$("#loading").removeClass("active").addClass("hidden");
				return true;
			},
		}).modal('show');
	});

	$("#selectObjectButton").click(async function () {
		let sObjectApiName = $('#objectSelector').dropdown('get value');
		targetObject = sobjects[sObjectApiName];

		// 項目レベルセキュリティ
		$("#viewInfo").text(
			`${chrome.i18n.getMessage('FieldPermission')} >> ${targetObject.label}(${targetObject.name})`
		).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getProfile();
		await getPermissionSet();
		await getFieldDefinition();
		await getFieldPermission();

		let isResetSearchCells = true;
		if (viewType == VIEW_FIELD_PERMISSION) {
			isResetSearchCells = false;
		}

		viewType = VIEW_FIELD_PERMISSION;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getLayoutAssignButton").click(async function() {
		$("#loading").removeClass("hidden").addClass("active");
		// レイアウト割り当て
		$("#viewInfo").text(chrome.i18n.getMessage('LayoutAssign')).show();

		await getLayout();
		await getProfile();
		await getEntityDefinition();
		await getRecordType();
		await getLayoutAssign();

		let isResetSearchCells = true;
		if (viewType == VIEW_LAYOUT_ASSIGN) {
			isResetSearchCells = false;
		}

		viewType = VIEW_LAYOUT_ASSIGN;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}
	});

	$("#getClassAccessButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// クラスアクセス
		$("#viewInfo").text(chrome.i18n.getMessage('ClassAccess')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getApexClass();
		await getProfile();
		await getPermissionSet();
		await getSetupEntityAccess('ApexClass');

		let isResetSearchCells = true;
		if (viewType == VIEW_CLASS_ACCESS) {
			isResetSearchCells = false;
		}

		viewType = VIEW_CLASS_ACCESS;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getPageAccessButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// ページアクセス
		$("#viewInfo").text(chrome.i18n.getMessage('PageAccess')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getApexPage();
		await getProfile();
		await getPermissionSet();
		await getSetupEntityAccess('ApexPage');

		let isResetSearchCells = true;
		if (viewType == VIEW_PAGE_ACCESS) {
			isResetSearchCells = false;
		}

		viewType = VIEW_PAGE_ACCESS;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getTabAccessButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// タブアクセス
		$("#viewInfo").text(chrome.i18n.getMessage('TabAccess')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getTabDefinition();
		await getProfile();
		await getPermissionSet();
		await getPermissionSetTabSetting();

		let isResetSearchCells = true;
		if (viewType == VIEW_TAB_ACCESS) {
			isResetSearchCells = false;
		}

		viewType = VIEW_TAB_ACCESS;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getAppAccessButton").click(async function () {
		$("#loading").removeClass("hidden").addClass("active");
		// アプリケーションアクセス
		$("#viewInfo").text(chrome.i18n.getMessage('AppAccess')).show();

		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || mode == MODE_USER_SUMMARY) {
			await filterForSummary();
		}

		await getAppDefinition();
		await getProfile();
		await getPermissionSet();
		await getSetupEntityAccess('TabSet');

		let isResetSearchCells = true;
		if (viewType == VIEW_APP_ACCESS) {
			isResetSearchCells = false;
		}

		viewType = VIEW_APP_ACCESS;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getAccessRestrictionButton").click(async function() {
		$("#loading").removeClass("hidden").addClass("active");
		// アクセス制限
		$("#viewInfo").text(chrome.i18n.getMessage('AccessRestriction')).show();

		await getProfile();

		//TODO 関数化する？
		callouts = [];
	
		// アクセス制限はSOQL系で取れないので、対象の全プロファイルについてAPIコールする(並列可)
		Object.values(profiles).forEach(profile => {
			callouts.push(
				(async (profile) => {
					queryTargetObject = 'Profile';
					let records = await query(`select Id, Metadata from Profile where Id = '${profile.id}'`, true);

					let profileRecord = records[0];

					// ログインIP範囲
					profile.loginIpRanges = [];

					profileRecord.Metadata.loginIpRanges.forEach(ipRange => {
						let loginIpRante = new LoginIpRange(ipRange.startAddress, ipRange.endAddress, ipRange.description);

						profile.loginIpRanges.push(loginIpRante);
					});

					// ログイン可能時間
					if (profileRecord.Metadata.loginHours) {
						profile.sundayStart = profileRecord.Metadata.loginHours.sundayStart;
						profile.sundayEnd = profileRecord.Metadata.loginHours.sundayEnd;
						profile.mondayStart = profileRecord.Metadata.loginHours.mondayStart;
						profile.mondayEnd = profileRecord.Metadata.loginHours.mondayEnd;
						profile.tuesdayStart = profileRecord.Metadata.loginHours.tuesdayStart;
						profile.tuesdayEnd = profileRecord.Metadata.loginHours.tuesdayEnd;
						profile.wednesdayStart = profileRecord.Metadata.loginHours.wednesdayStart;
						profile.wednesdayEnd = profileRecord.Metadata.loginHours.wednesdayEnd;
						profile.thursdayStart = profileRecord.Metadata.loginHours.thursdayStart;
						profile.thursdayEnd = profileRecord.Metadata.loginHours.thursdayEnd;
						profile.fridayStart = profileRecord.Metadata.loginHours.fridayStart;
						profile.fridayEnd = profileRecord.Metadata.loginHours.fridayEnd;
						profile.saturdayStart = profileRecord.Metadata.loginHours.saturdayStart;
						profile.saturdayEnd = profileRecord.Metadata.loginHours.saturdayEnd;
					}
				})(profile)
			);
		});

		await Promise.all(callouts);

		let isResetSearchCells = true;
		if (viewType == VIEW_ACCESS_RESTRICTION) {
			isResetSearchCells = false;
		}

		viewType = VIEW_ACCESS_RESTRICTION;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}
	});

	$("#getPermissionSetGroupButton").click(async function() {
		$("#loading").removeClass("hidden").addClass("active");
		// 権限セット
		$("#viewInfo").text(chrome.i18n.getMessage('PermissionSetGroup')).show();

		await getProfile();

		let isResetSearchCells = true;
		if (viewType == VIEW_PERMISSION_SET_GROUP) {
			isResetSearchCells = false;
		}

		viewType = VIEW_PERMISSION_SET_GROUP;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	$("#getPermissionSetAssignButton").click(async function() {
		$("#loading").removeClass("hidden").addClass("active");
		// 権限セット
		$("#viewInfo").text(chrome.i18n.getMessage('PermissionSetAssign')).show();

		await getProfile();
		await getPermissionSetAssignment();
		await getUsers();

		let isResetSearchCells = true;
		if (viewType == VIEW_PERMISSION_SET_ASSIGN) {
			isResetSearchCells = false;
		}

		viewType = VIEW_PERMISSION_SET_ASSIGN;
		redraw();

		if (isResetSearchCells) {
			$("#searchCells").val("");
		} else {
			$("#searchCells").keyup();
		}

		$("#loading").removeClass("active").addClass("hidden");
	});

	function enabledFilterButtons() {
		$("#tools button").removeClass("disabled");
	}

	function updateCounter(filters, rows) {
		let element = document.getElementById("counter");
		// ～件 表示中
		element.innerHTML = rows.length + chrome.i18n.getMessage('FilterCounterSuffix');
	}

	function redraw() {
		enabledFilterButtons();

		switch (viewType) {
			case VIEW_SYSTEM_PERMISSION:
				redrawForSystemPermission();
				break;
			case VIEW_OBJECT_PERMISSION:
				redrawForObjectPermission();
				break;
			case VIEW_FIELD_PERMISSION:
				redrawForFieldPermission();
				break;
			case VIEW_LAYOUT_ASSIGN:
				redrawForLayoutAssign();
				break;
			case VIEW_CLASS_ACCESS:
				redrawForClassAccess();
				break;
			case VIEW_PAGE_ACCESS:
				redrawForPageAccess();
				break;
			case VIEW_TAB_ACCESS:
				redrawForTabAccess();
				break;
			case VIEW_APP_ACCESS:
				redrawForAppAccess();
				break;
			case VIEW_ACCESS_RESTRICTION:
				redrawForAccessRestriction();
				break;
			case VIEW_PERMISSION_SET_GROUP:
				redrawForPermissionSetGroup();
				break;
			case VIEW_PERMISSION_SET_ASSIGN:
				redrawForPermissionSetAssign();
				break;
		}
	}
	
	function redrawForSystemPermission() {
		let keys = Object.keys(profiles);

		let fieldKeys = Object.keys(profileFields);

		let datas = [];

		let colModel = [
			// 項目名
			{ title: chrome.i18n.getMessage('FieldName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({
					title: p.name, field: p.id, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: p.name, cssClass: p.type
				});

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		fieldKeys.forEach(key => {
			let data = {};
			data['label'] = profileFields[key];
			data['api'] = key;

			summaryOp = false;

			keys.forEach(profile => {
				let op = profiles[profile].profilePermissions[key];

				let yesMark = null;
				if (profiles[profile].type == TYPE_MUTE) {
					// ×
					yesMark = chrome.i18n.getMessage('No');
				} else {
					// ○
					yesMark = chrome.i18n.getMessage('Yes');
				}

				if (op) {
					data[profile] = yesMark

					if (!filterColumns[profile]) {
						summaryOp = true;
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryOp ? chrome.i18n.getMessage('Yes') : '';
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForObjectPermission() {
		let keys = Object.keys(profiles);

		let objectKeys = Object.keys(sobjects);

		let datas = [];

		let colModel = [
			// ラベル
			{ title: chrome.i18n.getMessage('Label'), field: 'label', frozen: true, headerHozAlign: "center", resizable: false, tooltip: true},
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", resizable: false, tooltip: true }
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			let subCols = [];

			// 参照
			subCols.push({ title: chrome.i18n.getMessage('Read'), field: 'summary_r', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
			// 作成
			subCols.push({ title: chrome.i18n.getMessage('Create'), field: 'summary_c', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
			// 編集
			subCols.push({ title: chrome.i18n.getMessage('Edit'), field: 'summary_u', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
			// 削除
			subCols.push({ title: chrome.i18n.getMessage('Delete'), field: 'summary_d', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
			// すべて表示
			subCols.push({ title: chrome.i18n.getMessage('AllRead'), field: 'summary_ar', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
			// すべて編集
			subCols.push({ title: chrome.i18n.getMessage('AllEdit'), field: 'summary_au', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });

			colModel.push(
				{ title: "Summary", field: "Summary", frozen: true, columns: subCols, headerHozAlign: "center", headerWordWrap: true, variableHeight: true, headerTooltip: "Summary", resizable: false, cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				let subCols = [];

				// 参照
				subCols.push({ title: chrome.i18n.getMessage('Read'), field: p.id + '_r', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
				// 作成
				subCols.push({ title: chrome.i18n.getMessage('Create'), field: p.id + '_c', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
				// 編集
				subCols.push({ title: chrome.i18n.getMessage('Edit'), field: p.id + '_u', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
				// 削除
				subCols.push({ title: chrome.i18n.getMessage('Delete'), field: p.id + '_d', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
				// すべて表示
				subCols.push({ title: chrome.i18n.getMessage('AllRead'), field: p.id + '_ar', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });
				// すべて編集
				subCols.push({ title: chrome.i18n.getMessage('AllEdit'), field: p.id + '_au', minWidth: 28, width: 28, hozAlign: "center", headerVertical: true, resizable: false });

				colModel.push(
					{ title: p.name, field: p.id, columns: subCols, headerHozAlign: "center", headerWordWrap: true, variableHeight: true, headerTooltip :p.name, resizable: false, cssClass: p.type }
				);

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		objectKeys.forEach(key => {
			let data = {};
			targetObject = sobjects[key];
			data['label'] = targetObject.label;
			data['api'] = key;

			summaryOpCanRead = false;
			summaryOpCanCreate = false;
			summaryOpCanEdit = false;
			summaryOpCanDelete = false;
			summaryOpCanViewAll = false;
			summaryOpCanModifyAll = false;

			keys.forEach(profile => {
				let op = profiles[profile].objectPermissions[key];

				let yesMark = null;
				if (profiles[profile].type == TYPE_MUTE) {
					// ×
					yesMark = chrome.i18n.getMessage('ShortNo');
				} else {
					// ○
					yesMark = chrome.i18n.getMessage('ShortYes');
				}

				if (op && op.canRead) {
					data[profile + '_r'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanRead = true;
					}
				} else {
					data[profile + '_r'] = '';
				}

				if (op && op.canCreate) {
					data[profile + '_c'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanCreate = true;
					}
				} else {
					data[profile + '_c'] = '';
				}

				if (op && op.canEdit) {
					data[profile + '_u'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanEdit = true;
					}
				} else {
					data[profile + '_u'] = '';
				}

				if (op && op.canDelete) {
					data[profile + '_d'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanDelete = true;
					}
				} else {
					data[profile + '_d'] = '';
				}

				if (op && op.canViewAll) {
					data[profile + '_ar'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanViewAll = true;
					}
				} else {
					data[profile + '_ar'] = '';
				}

				if (op && op.canModifyAll) {
					data[profile + '_au'] = yesMark;

					if (!filterColumns[profile]) {
						summaryOpCanModifyAll = true;
					}
				} else {
					data[profile + '_au'] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary_r'] = summaryOpCanRead ? chrome.i18n.getMessage('ShortYes') : '';
				data['summary_c'] = summaryOpCanCreate ? chrome.i18n.getMessage('ShortYes') : '';
				data['summary_u'] = summaryOpCanEdit ? chrome.i18n.getMessage('ShortYes') : '';
				data['summary_d'] = summaryOpCanDelete ? chrome.i18n.getMessage('ShortYes') : '';
				data['summary_ar'] = summaryOpCanViewAll ? chrome.i18n.getMessage('ShortYes') : '';
				data['summary_au'] = summaryOpCanModifyAll ? chrome.i18n.getMessage('ShortYes') : '';
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForFieldPermission() {
		let keys = Object.keys(profiles);

		let fieldKeys = Object.keys(targetObject.fields);

		let datas = [];

		let colModel = [
			// 項目名
			{ title: chrome.i18n.getMessage('FieldName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// タイプ
			{ title: chrome.i18n.getMessage('FieldType'), field: 'type', frozen: true, headerHozAlign: "center", minWidth: 100, tooltip: true },
			// 必須
			{ title: chrome.i18n.getMessage('Required'), field: 'isRequired', frozen: true, headerHozAlign: "center", minWidth: 20, hozAlign: "center"},
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: p.name, cssClass: p.type});

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		fieldKeys.forEach(key => {
			let data = {};
			targetField = targetObject.fields[key];
			
			data['api'] = targetField.name;
			data['label'] = targetField.label;
			data['type'] = targetField.type;
			// ブランクか○
			data['isRequired'] = targetField.isNillable ? '' : chrome.i18n.getMessage('Yes');

			summaryMark = '';

			keys.forEach(profile => {
				let fp = profiles[profile].fieldPermissions[key];

				// 日英共通
				if (fp && fp.canEdit) {
					if (profiles[profile].type == TYPE_MUTE) {
						data[profile] = '-RW';
					} else {
						data[profile] = 'RW';
					}

					if (!filterColumns[profile]) {
						summaryMark = 'RW';
					}
				} else if (fp && fp.canRead) {
					if (profiles[profile].type == TYPE_MUTE) {
						// Rのミュートは書き込み権限の削除になるっぽい
						data[profile] = '-W';
					} else {
						data[profile] = 'R';
					}

					if (!filterColumns[profile] && summaryMark == '') {
						summaryMark = 'R';
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryMark;
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForLayoutAssign() {
		let keys = Object.keys(profiles);

		let datas = [];

		let colModel = [
			// オブジェクトラベル
			{ title: chrome.i18n.getMessage('ObjectLabel'), field: 'objectLabel', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// オブジェクトAPI参照名
			{ title: chrome.i18n.getMessage('ObjectDeveloperName'), field: 'objectApi', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// レコードタイプラベル
			{ title: chrome.i18n.getMessage('RecordTypeLabel'), field: 'recordTypeLabel', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// レコードタイプAPI参照名
			{ title: chrome.i18n.getMessage('RecordTypeDeveloperName'), field: 'recordTypeApi', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
		];

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 200, headerWordWrap: true, width: 200, hozAlign: "center", headerTooltip: p.name, tooltip: true, cssClass: p.type });
			}
		});

		Object.values(sobjects).forEach(sobject => {
			let data = {};

			data['objectLabel'] = sobject.label;
			data['objectApi'] =  sobject.name;

			keys.forEach(profile => {
				let layout = profiles[profile].layoutAssigns[sobject.name + null];
				data[profile] = layout ? layout.name : "";
			});

			datas.push(data);

			Object.values(sobject.recordTypes).forEach(recordType => {
				let data = {};

				data['objectLabel'] = sobject.label;
				data['objectApi'] =  sobject.name;
				data['recordTypeLabel'] = recordType.label;
				data['recordTypeApi'] =  recordType.name;

				keys.forEach(profile => {
					let layout = profiles[profile].layoutAssigns[sobject.name + recordType.id];
					data[profile] = layout ? layout.name : "";
				});

				datas.push(data);
			});
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForClassAccess() {
		let keys = Object.keys(profiles);

		let classKeys = Object.keys(apexClasses);

		let datas = [];

		let colModel = [
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true}
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({
					title: p.name, field: p.id, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: p.name, cssClass: p.type
				});

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		classKeys.forEach(key => {
			let data = {};
			let targetClass = apexClasses[key];
			data['api'] = targetClass.name;

			summaryOp = false;

			keys.forEach(profile => {
				let op = profiles[profile].classAccesses[key];

				let yesMark = null;
				if (profiles[profile].type == TYPE_MUTE) {
					// ×
					yesMark = chrome.i18n.getMessage('No');
				} else {
					// ○
					yesMark = chrome.i18n.getMessage('Yes');
				}

				if (op) {
					data[profile] = yesMark;

					if (!filterColumns[profile]) {
						summaryOp = true;
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryOp ? chrome.i18n.getMessage('Yes') : '';
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForPageAccess() {
		let keys = Object.keys(profiles);

		let pageKeys = Object.keys(apexPages);

		let datas = [];

		let colModel = [
			// ページ名
			{ title: chrome.i18n.getMessage('PageName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true},
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: p.name, cssClass: p.type });

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		pageKeys.forEach(key => {
			let data = {};
			let targetPage = apexPages[key];
			data['label'] = targetPage.label;
			data['api'] = targetPage.name;

			summaryOp = false;

			keys.forEach(profile => {
				let op = profiles[profile].pageAccesses[key];

				let yesMark = null;
				if (profiles[profile].type == TYPE_MUTE) {
					// ×
					yesMark = chrome.i18n.getMessage('No');
				} else {
					// ○
					yesMark = chrome.i18n.getMessage('Yes');
				}

				if (op) {
					data[profile] = yesMark;
					if (!filterColumns[profile]) {
						summaryOp = true;
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryOp ? chrome.i18n.getMessage('Yes') : '';
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForTabAccess() {
		let keys = Object.keys(profiles);

		let tabKeys = Object.keys(tabDefinitions);

		let datas = [];

		let colModel = [
			// タブ名
			{ title: chrome.i18n.getMessage('TabName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true }
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}

		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: p.name, cssClass: p.type });

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		tabKeys.forEach(key => {
			let data = {};
			let targetTab = tabDefinitions[key];
			data['label'] = targetTab.label;
			data['api'] =  targetTab.name;

			summaryMark = '';

			keys.forEach(profile => {
				let op = profiles[profile].tabAccesses[key];

				if (op == "DefaultOn") {
					// 表示
					data[profile] = chrome.i18n.getMessage('TabOn');

					if (!filterColumns[profile]) {
						summaryMark = chrome.i18n.getMessage('TabOn');
					}
				} else if (op == "DefaultOff") {
					//TODO ミュートでOFFになる場合は必ず非表示がセットされる模様だが検証が必要かも
					if (profiles[profile].type == TYPE_MUTE) {
						// 非表示
						data[profile] = chrome.i18n.getMessage('No');
					} else {
						// 非表示
						data[profile] = chrome.i18n.getMessage('TabOff');
					}

					if (!filterColumns[profile] && summaryMark == '') {
						summaryMark = chrome.i18n.getMessage('TabOff');
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryMark;
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForAppAccess() {
		let keys = Object.keys(profiles);

		let appKeys = Object.keys(appDefinitions);

		let datas = [];

		let colModel = [
			// アプリケーション名
			{ title: chrome.i18n.getMessage('ApplicationName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			// API参照名
			{ title: chrome.i18n.getMessage('DeveloperName'), field: 'api', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true }
		];

		// サマリの場合、サマリ列を追加
		if (mode == MODE_USER_SUMMARY) {
			colModel.push(
				{ title: chrome.i18n.getMessage('Summary'), field: 'summary', frozen: true, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: chrome.i18n.getMessage('Summary'), cssClass: "Summary" }
			);
		}
		
		// サマリの場合、権限セット・プロファイルを先頭に移動
		if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY || (mode == MODE_USER_SUMMARY && selectedPermissionSetId)) {
			keys = keys.filter((x) => x != selectedPermissionSetId);
			keys.unshift(selectedPermissionSetId);
		}

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 70, headerWordWrap: true, width: 70, hozAlign: "center", headerTooltip: p.name, cssClass: p.type});

				if (mode == MODE_PERMISSION_SET_GROUP_SUMMARY && profile == selectedPermissionSetId) {
					colModel.at(-1).frozen = true;
				}
			}
		});

		appKeys.forEach(key => {
			let data = {};
			data['api'] = appDefinitions[key].name;
			data['label'] = appDefinitions[key].label;

			summaryOp = false;

			keys.forEach(profile => {
				let op = profiles[profile].appAccesses[key];

				let yesMark = null;
				if (profiles[profile].type == TYPE_MUTE) {
					// ×
					yesMark = chrome.i18n.getMessage('No');
				} else {
					// ○
					yesMark = chrome.i18n.getMessage('Yes');
				}

				if (op) {
					data[profile] = yesMark;

					if (!filterColumns[profile]) {
						summaryOp = true;
					}
				} else {
					data[profile] = '';
				}
			});

			// サマリの場合、サマリデータを追加
			if (mode == MODE_USER_SUMMARY) {
				data['summary'] = summaryOp ? chrome.i18n.getMessage('Yes') : '';
			}

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForAccessRestriction() {
		let keys = Object.keys(profiles);

		let datas = [];

		let colModel = [
			// アクセス制限
			{ title: chrome.i18n.getMessage('AccessRestriction'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: false },
		];

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({ title: p.name, field: p.id, minWidth: 160, headerWordWrap: true, width: 160, hozAlign: "center", formatter:"textarea", headerTooltip: p.name, cssClass: p.type});
			}
		});

		const weekday = [
			// ログイン可能時間(日曜日)
			[chrome.i18n.getMessage('LoginTimeSunday'), "sundayStart", "sundayEnd"],
			// ログイン可能時間(月曜日)
			[chrome.i18n.getMessage('LoginTimeMonday'), "mondayStart", "mondayEnd"],
			// ログイン可能時間(火曜日)
			[chrome.i18n.getMessage('LoginTimeTuesday'), "tuesdayStart", "tuesdayEnd"],
			// ログイン可能時間(水曜日)
			[chrome.i18n.getMessage('LoginTimeWednesday'), "wednesdayStart", "wednesdayEnd"],
			// ログイン可能時間(木曜日)
			[chrome.i18n.getMessage('LoginTimeThursday'), "thursdayStart", "thursdayEnd"],
			// ログイン可能時間(金曜日)
			[chrome.i18n.getMessage('LoginTimeFriday'), "fridayStart", "fridayEnd"],
			// ログイン可能時間(土曜日)
			[chrome.i18n.getMessage('LoginTimeSaturday'), "saturdayStart", "saturdayEnd"],
		];

		weekday.forEach(day => {
			let data = {};
			data['label'] = day[0];

			keys.forEach(profile => {
				if (profiles[profile][day[1]] && profiles[profile][day[2]]) {
					let startMinutes = profiles[profile][day[1]];
					let startHour = startMinutes / 60;
					startMinutes = startMinutes % 60;

					startHour = startHour.toString().padStart(2, "0");
					startMinutes = startMinutes.toString().padStart(2, "0");

					let endMinutes = profiles[profile][day[2]];
					let endHour = endMinutes / 60;
					endMinutes = endMinutes % 60;

					endHour = endHour.toString().padStart(2, "0");
					endMinutes = endMinutes.toString().padStart(2, "0");

					data[profile] = `${startHour}:${startMinutes}-${endHour}:${endMinutes}`
				}
			});

			datas.push(data);
		});

		let data = {};
		// IPアドレス制限
		data['label'] = chrome.i18n.getMessage('IpAddressRestriction');
		
		keys.forEach(profile => {
			let str = "";
		
			profiles[profile].loginIpRanges.forEach(ip => {
				str += `${ip.startIp}-${ip.endIp} : ${ip.description}\n`;
			});
			
			data[profile] = str;
		});
		
		datas.push(data);

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForPermissionSetGroup() {
		let keys = Object.keys(profiles);

		let permissionSetGroupKeys = Object.keys(permissionSetGroups);

		let datas = [];

		let colModel = [
			// 項目名
			{ title: chrome.i18n.getMessage('PermissionSetGroupName'), field: 'label', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
		];

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({
					title: p.name, field: p.id, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: p.name, cssClass: p.type
				});
			}
		});

		permissionSetGroupKeys.forEach(key => {
			let data = {};
			data['label'] = permissionSetGroups[key];

			keys.forEach(profile => {
				let op = profiles[profile].permissionSetGroups[key];

				if (op) {
					// ○
					data[profile] = chrome.i18n.getMessage('Yes');
				} else {
					data[profile] = '';
				}
			});

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}

	function redrawForPermissionSetAssign() {
		let keys = Object.keys(profiles);

		let userKeys = Object.keys(users);

		let datas = [];

		let colModel = [
			{ title: chrome.i18n.getMessage('Name'), field: 'name', frozen: true, headerHozAlign: "center", minWidth: 200, tooltip: true },
			{ title: chrome.i18n.getMessage('Username'), field: 'username', frozen: true, headerHozAlign: "center", minWidth: 300, tooltip: true },
			{ title: chrome.i18n.getMessage('Active'), field: 'isActive', frozen: true, headerHozAlign: "center", hozAlign: "center", minWidth: 50, tooltip: true },
		];

		keys.forEach(profile => {
			let p = profiles[profile];

			if (!filterColumns[profile]) {
				colModel.push({
					title: p.name, field: p.id, minWidth: 60, headerWordWrap: true, width: 60, hozAlign: "center", headerTooltip: p.name, cssClass: p.type
				});
			}
		});

		userKeys.forEach(key => {
			let data = {};
			data['name'] = users[key].name;
			data['username'] = users[key].username;
			data['isActive'] = users[key].isActive ? chrome.i18n.getMessage('Yes') : '';

			keys.forEach(profile => {
				let op = profiles[profile].users[key];

				if (op) {
					// ○
					data[profile] = chrome.i18n.getMessage('Yes');
				} else {
					data[profile] = '';
				}
			});

			datas.push(data);
		});

		if (table) {
			table.destroy();
		}

		table = new Tabulator("#tabulator", {
			height: document.body.clientHeight - 185,
			data: datas,
			layout: "fitDataFill",
			columns: colModel,
			columnHeaderVertAlign: "middle",
		});

		table.on("dataFiltered", updateCounter);
		table.on("dataProcessed", function(){ $("#loading").removeClass("active").addClass("hidden"); } );
	}
})