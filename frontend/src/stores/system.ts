import { Version } from "../../bindings/github.com/oxygem/kanmail/internal/backend/models.ts";
import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { EventName } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events, System } from "../../wails/runtime.js";
import { BaseStore } from "./base.tsx";

export interface ISystem {
    currentVersion: string;
    isDebug: boolean;
    isLicensed: boolean;
    hasUpdate: boolean;
    update?: Version;
}

class SystemStore extends BaseStore {
    props: ISystem;

    constructor() {
        super();
        this.props = {
            currentVersion: "",
            isDebug: false,
            isLicensed: false,
            hasUpdate: false,
        };
    }

    async checkCachedLicense(): Promise<void> {
        this.props.isLicensed = await AppService.CheckCachedLicense();
    }

    async checkDebug(): Promise<void> {
        this.props.isDebug = (await System.Environment()).Debug;
    }

    async checkLicense(): Promise<void> {
        const hasLicense = await AppService.CheckLicense();
        if (hasLicense === this.props.isLicensed) {
            return;
        }
        this.props.isLicensed = hasLicense;
        this.triggerUpdate(["isLicensed"]);
    }

    async checkUpdate(): Promise<void> {
        const [update, currentVersion] = await AppService.CheckUpdate();
        const hasUpdate = update !== null;
        if (hasUpdate === this.props.hasUpdate && currentVersion === this.props.currentVersion) {
            return;
        }
        this.props.update = update || undefined;
        this.props.hasUpdate = hasUpdate;
        this.props.currentVersion = currentVersion;
        this.triggerUpdate(["update", "hasUpdate", "currentVersion"]);
    }
}

const systemStore = new SystemStore();

// @ts-ignore
window.systemStore = systemStore;
export default systemStore;

Events.On(EventName.LicenseChangedEvent, (ev) => {
    console.debug("[systemStore] Received license changed event", ev);
    systemStore.checkLicense();
});
