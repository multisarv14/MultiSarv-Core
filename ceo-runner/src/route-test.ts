/** `npm run route -- "garage madhe invoice PDF la logo add kar"` — fakt project olkh, kaam nahi. */
import { loadProjects } from "./projects.ts";
import { matchProject } from "./router.ts";

const command = process.argv.slice(2).join(" ");
if (!command) {
  console.error('Vapar: npm run route -- "<command>"');
  process.exit(1);
}
console.log(await matchProject(command, loadProjects(), []));
process.exit(0);
