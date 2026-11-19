// One optional UI boundary before the existing native storage-mode setter.
// Its failure never changes whether the setting operation is attempted.
export const SETTINGS_UI_INTENT_PAIR = {
  before: 'try{await w.setStorageMode(z.userId,h),',
  after: 'try{try{var uiIntent=window.VildaUiIntents;if(uiIntent&&uiIntent.version===1&&typeof uiIntent.clear==="function")uiIntent.clear()}catch{}await w.setStorageMode(z.userId,h),'
};
export function applySettingsUiIntentHook(source) {
  if (source.includes(SETTINGS_UI_INTENT_PAIR.after)) return source;
  if (source.split(SETTINGS_UI_INTENT_PAIR.before).length !== 2) throw new Error('Ambiguous native Settings mode setter');
  return source.replace(SETTINGS_UI_INTENT_PAIR.before, SETTINGS_UI_INTENT_PAIR.after);
}
export function reverseSettingsUiIntentHook(source) {
  if (source.split(SETTINGS_UI_INTENT_PAIR.after).length !== 2) throw new Error('Missing Settings UI intent boundary');
  return source.replace(SETTINGS_UI_INTENT_PAIR.after, SETTINGS_UI_INTENT_PAIR.before);
}
