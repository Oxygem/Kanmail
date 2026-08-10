import { AppService } from "../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

export async function openLink(link) {
  await AppService.OpenLink(link);
}
