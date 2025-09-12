import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { EventName } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events, System } from "../../wails/runtime.js";
import { BaseStore } from "./base.tsx";

export interface ISystem {
    version: string;
    isDebug: boolean;
    isLicensed: boolean;
    hasUpdate: boolean;
}

class SystemStore extends BaseStore {
    props: ISystem;

    constructor() {
        super();
        this.props = {
            version: "",
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
        const [hasUpdate, version] = await AppService.CheckUpdate();
        if (hasUpdate === this.props.hasUpdate && version === this.props.version) {
            return;
        }
        this.props.hasUpdate = hasUpdate;
        this.props.version = version;
        this.triggerUpdate(["hasUpdate", "version"]);
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
