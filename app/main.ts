import { SHELL_HOST_ID, mountShell } from './shell';

const host = document.createElement('div');
host.id = SHELL_HOST_ID;
host.hidden = true;
document.body.append(host);
mountShell(host);
