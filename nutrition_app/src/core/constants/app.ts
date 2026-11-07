export const APP_NAME = 'nutrition_app';
export const APP_VERSION = '1.0.0';
/** Contact string sent to Open Food Facts (their API etiquette asks apps to identify themselves). */
export const APP_CONTACT = 'personal-use';
export const DEFAULT_DB_NAME = 'nutrition_app';

export const USDA_ATTRIBUTION =
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: SR Legacy (2018). fdc.nal.usda.gov';
export const USDA_LICENSE = 'Public domain (CC0 1.0)';
export const OFF_ATTRIBUTION = 'Data from Open Food Facts (openfoodfacts.org)';
export const OFF_LICENSE = 'Open Database License (ODbL) 1.0; contents under Database Contents License';

/** Seed dataset version; bump when usdaFoods.json changes so seeding re-runs. */
// v2: catalog names, aliases and serving labels translated to Spanish (Spain); re-seed installed apps.
export const SEED_VERSION = 2;
