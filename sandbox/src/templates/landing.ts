import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ejs from 'ejs';

interface LandingPageOptions {
    serverUrl: string;
    isLocalMode: boolean;
}

const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'landing.ejs');
const landingTemplate = readFileSync(templatePath, 'utf8');

const llmsTemplatePath = join(dirname(fileURLToPath(import.meta.url)), 'llms.md');
const llmsTemplate = readFileSync(llmsTemplatePath, 'utf8');

export function getLandingPageHTML({ serverUrl, isLocalMode }: LandingPageOptions): string {
    const modeLabel = isLocalMode ? 'Local mode (deps skipped)' : 'Production mode';

    return ejs.render(landingTemplate, {
        serverUrl,
        modeLabel,
        isLocalMode,
    });
}

export function getLLMsMarkdown({ serverUrl }: { serverUrl: string }): string {
    return ejs.render(llmsTemplate, { serverUrl });
}
