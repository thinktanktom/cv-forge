/**
 * Registers the three selection engines with the registry in `selector.ts`.
 * Importing this module (rather than the individual engine modules) is what
 * makes all three available to `getSelector`/`registeredEngines`.
 */

import { register } from '../selector.js';
import { ClaudeSelector } from './claude.js';
import { JevSelector } from './jev.js';
import { TagSelector } from './tag.js';

register('tag', async () => new TagSelector());
register('jev', async () => new JevSelector());
register('claude', async () => new ClaudeSelector());
