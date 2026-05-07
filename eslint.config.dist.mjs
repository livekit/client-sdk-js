// @ts-check
import compat from 'eslint-plugin-compat';

const compatPlugin = compat.configs['flat/recommended'];

compatPlugin.settings = { ...compatPlugin.settings, lintAllEsApis: true };

if (compatPlugin.rules) {
  compatPlugin.rules['compat/compat'] = 'warn'; // TODO once we've updated browser support and use feature detection that this plugin can understand we can change this to 'error'
}

export default [compatPlugin];
