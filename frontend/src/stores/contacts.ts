import { AvatarResp, ContactsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";

export interface IContacts {
    // Senders to always show images from
    alwaysShowImages: Set<string>;
}

class ContactsStore {
    props: IContacts
    avatars: Map<string, string>;

    constructor() {
        this.props = {
            alwaysShowImages: new Set<string>(),
        }
    }

    addrKey(addr: Address): string {
        return addr.email + addr.name;
    }

    async addAlwaysShowImages(addr: Address) {
        this.props.alwaysShowImages.add(this.addrKey(addr));
        await ContactsService.AddAlwaysShowImages(addr)
    }

    async shouldSendersShowImages(addrs: Address[]): Promise<Map<string, boolean>> {
        const senderMap = new Map<string, boolean>();

        for (const addr of addrs) {
            if (this.props.alwaysShowImages.has(this.addrKey(addr))) {
                senderMap.set(this.addrKey(addr), true);
                continue;
            }
            const should = await ContactsService.ShouldSenderShowImages(addr)
            if (should) {
                this.props.alwaysShowImages.add(this.addrKey(addr));
                senderMap.set(this.addrKey(addr), true);
                continue;
            }
            senderMap.set(this.addrKey(addr), false);
        }

        return senderMap;
    }

    async getAvatar(email: string): Promise<AvatarResp | null> {
        // TODO: CACHE
        return ContactsService.GetAvatar(email);
    }
}

const contactsStore = new ContactsStore();

// @ts-ignore
window.contactsStore = contactsStore;
export default contactsStore;
