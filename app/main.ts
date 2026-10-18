import { SHELL_HOST_ID, mountShell } from './shell';
import { createDialogShell } from './islands/dialog/register';
import { createSettingsPanel } from './islands/settings/register';

window.rpenIslands = { settings: { createSettingsPanel }, dialog: { createDialogShell } };

const host = document.createElement('div');
host.id = SHELL_HOST_ID;
host.hidden = true;
document.body.append(host);
mountShell(host);
