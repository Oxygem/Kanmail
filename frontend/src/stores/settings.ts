import _ from "lodash";
import { EmailsService, SettingsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, EventName, Settings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events } from "../../wails/runtime.js";
import { setupThemes } from "../theme.ts";
import { arrayMove } from "../util/array.ts";
import { BaseStore } from "./base.tsx";

export interface ISettings extends Settings {
}

class SettingsStore extends BaseStore {
	/*
		Global store of the users app settings.
	*/

	props: ISettings;
	prevProps: ISettings;

	// Flag to indicate first set of settings - ie false means we set props + prevProps
	hasFirstSet: boolean = false;

	constructor() {
		super();
		this.props = new Settings();
		this.prevProps = new Settings();
	}

	getCurrentColumns(): Array<string> {
		if (!this.props.columnGroups[this.props.currentColumnGroup]) {
			this.props.columnGroups[this.props.currentColumnGroup] = [];
		}
		return this.props.columnGroups[this.props.currentColumnGroup];
	}

	getPrevColumns(): Array<string> {
		return this.prevProps.columnGroups[this.prevProps.currentColumnGroup] || [];
	}

	// TODO: do wrapper function?
	savePrevProps() {
		this.prevProps = _.cloneDeep(this.props);
	}

	async closeColumnGroup() {
		this.savePrevProps();
		this.props.currentColumnGroup = "";
		await this.putSettings();;
	}

	async selectColumnGroup(name: string) {
		this.savePrevProps();
		this.props.currentColumnGroup = name;
		await this.putSettings();;
	}

	async saveColumnGroup(name: string) {
		if (this.props.currentColumnGroup != "") {
			throw new Error("cannot save existing column group")
		}
		if (this.props.columnGroups[name]) {
			throw new Error("cannot overwrite existing column group");
		}
		this.savePrevProps();
		this.props.columnGroups[name] = this.getCurrentColumns();
		this.props.currentColumnGroup = name;
		// Reset default column group to inbox
		this.props.columnGroups[""] = ["inbox"];
		await this.putSettings();
	}

	async deleteCurrentColumnGroup() {
		if (this.props.currentColumnGroup == "") {
			throw new Error("cannot delete default column group")
		}
		this.savePrevProps();
		delete (this.props.columnGroups[this.props.currentColumnGroup]);
		this.props.currentColumnGroup = "";
		await this.putSettings();;
	}

	async setColumn(name: string, idx) {
		this.savePrevProps();
		this.getCurrentColumns()[idx] = name;
		await this.putSettings();
	}

	async addColumn(name: string) {
		this.savePrevProps();
		this.getCurrentColumns().push(name);
		await this.putSettings();;
	}

	async removeColumn(name: string) {
		this.savePrevProps();
		this.props.columnGroups[this.props.currentColumnGroup] = _.without(
			this.getCurrentColumns(),
			name,
		);
		await this.putSettings();
	}

	async moveColumn(name: string, position: number) {
		this.savePrevProps();
		const index = this.props.columnGroups[this.props.currentColumnGroup].indexOf(name);
		arrayMove(this.props.columnGroups[this.props.currentColumnGroup], index, index + position);
		await this.putSettings();
	}

	async moveColumnLeft(name: string) {
		await this.moveColumn(name, -1);
	}

	async moveColumnRight(name: string) {
		await this.moveColumn(name, 1);
	}

	async addSidebarFolder(name: string) {
		if (this.props.sidebarFolders.indexOf(name) > -1) {
			return;
		}

		this.props.sidebarFolders.push(name);
		await this.putSettings(["sidebarFolders"]);
	}

	async removeSidebarFolder(name: string) {
		if (this.props.sidebarFolders.indexOf(name) < 0) {
			return;
		}

		this.props.sidebarFolders = _.without(
			this.props.sidebarFolders,
			name,
		);
		await this.putSettings(["sidebarFolders"]);
	}

	async setCurrentAccount(accountName: string) {
		this.savePrevProps();
		if (this.props.currentAccount != accountName) {
			this.props.currentAccount = accountName;
			await this.putSettings(["currentAccount"]);
		}
	}

	async putSettings(propNames?: string[]) {
		// Immediately send the result to this window before saving
		this.triggerUpdate(propNames);
		setupThemes(this.props);
		return SettingsService.PutSettings(this.props);
	}

	setSettings(settings: ISettings) {
		// When calling putSettings we immediately apply the settings, then save. The save
		// then calls this via the SettingsChangedEvent.
		if (_.isEqual(this.props, settings)) {
			console.log("[settingsStore] Skip applying identical settings");
			return this.props;
		}

		this.props = settings;
		if (!this.hasFirstSet) {
			this.savePrevProps();
			this.hasFirstSet = true;
		}
		this.triggerUpdate();

		// Apply any theme changes (gross?)
		setupThemes(this.props);
		return this.props;
	}

	async getSettings(): Promise<ISettings> {
		return SettingsService.GetSettings().then((settings) => {
			this.setSettings(settings);
			return settings;
		});
	}

	async updateSettings(settings: Partial<Settings>) {
		this.props = {
			...this.props,
			...settings,
		};
		await this.putSettings();
	}

	getAccountSettings(accountName: string): AccountSettings | undefined {
		return _.find(
			this.props.accounts,
			(account) => account.name === accountName,
		);
	}

	getAccountAccentColor(accountName: string): string | undefined {
		const c = this.getAccountSettings(accountName)?.settings.accentColor;
		if (c === "transparent") {
			return undefined;
		}
		return c;
	}

	async clearOAuthAccessTokens() {
		await EmailsService.ClearOAuthAccessTokens();
	}

	async closeAccountConnections(accountName: string) {
		await EmailsService.CloseAccountConnections(accountName);
	}
}

const settingsStore = new SettingsStore();

// @ts-ignore
window.settingsStore = settingsStore;
export default settingsStore;

Events.On(EventName.SettingsChangedEvent, (ev) => {
	console.debug("[settingsStore] Received settings changed event", ev);
	settingsStore.setSettings(ev.data);
});
