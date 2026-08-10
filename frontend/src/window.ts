import { AppService } from "../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

export async function openLink(link: string | null) {
  if (!link) {
    return;
  }

  // Kanmail may not be the OS mailto: handler, so handing the link over would
  // open whichever other client is - compose it here instead
  if (/^mailto:/i.test(link.trim())) {
    await AppService.OpenMailto(link);
    return;
  }

  await AppService.OpenLink(link);
}
