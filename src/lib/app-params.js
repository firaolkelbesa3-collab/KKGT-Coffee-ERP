// Lightweight helper for reading app params from URL query string with
// localStorage caching. Used for things like a one-shot access_token in the URL
// (legacy) or feature flags. Not Base44-specific.
const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const STORAGE_PREFIX = 'kkgt_';

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) return defaultValue;

	const storageKey = `${STORAGE_PREFIX}${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);

	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}

	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	return storage.getItem(storageKey) ?? null;
};

const getAppParams = () => {
	if (getAppParamValue('clear_access_token') === 'true') {
		storage.removeItem(`${STORAGE_PREFIX}access_token`);
		storage.removeItem('token');
	}
	return {
		token: getAppParamValue('access_token', { removeFromUrl: true }),
		fromUrl: getAppParamValue('from_url', { defaultValue: window.location.href }),
	};
};

export const appParams = { ...getAppParams() };
