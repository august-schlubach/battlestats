// The pre-paint boot script injected into <head> by app/layout.tsx.
//
// It runs before React and before first paint, which is the whole point: theme,
// realm and locale are all stamped onto <html> as attributes that CSS reads
// (`[data-theme]`, and the CJK typography rule `:root[data-lang="ko"]
// .uppercase`). Leaving any of them to a React effect means one frame rendered
// with the wrong tokens.
//
// Because it runs that early it cannot import anything — hence the duplicated
// locale mapping below, which must stay in step with detectLocale() in
// app/i18n/index.ts. It lives here rather than inline in layout.tsx so that
// bootScript.test.ts can eval the real string in jsdom; an inline string in a
// server component is untestable.

// Kept byte-identical to the pre-autodetect script: dark unless the stored
// theme says light, realm 'na' unless a known realm is stored.
const THEME_AND_REALM =
    "var t=localStorage.getItem('bs-theme');" +
    "if(t!=='light'&&t!=='dark')t='dark';" +
    'document.documentElement.dataset.theme=t;' +
    "var r=localStorage.getItem('bs-realm');" +
    "if(r&&['na','eu','asia'].indexOf(r)>=0)document.documentElement.dataset.realm=r;" +
    "else document.documentElement.dataset.realm='na';";

// Mirror of detectLocale(): walk navigator.languages IN ORDER (so ['en-US',
// 'ko-KR'] is English) and match on the primary subtag (ko-KR→ko). Falls back
// to navigator.language for the browsers that omit the array, then to 'en'.
const DETECT_LOCALE =
    'var d="";' +
    'var ls=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language];' +
    'for(var i=0;i<ls.length;i++){' +
    "var p=String(ls[i]||'').split('-')[0].toLowerCase();" +
    "if(p==='en'||p==='ko'||p==='ja'){d=p;break;}}" +
    "l=d||'en';";

export interface BootScriptOptions {
    // Mirrors isLocaleAutodetectEnabled(). When false the script emits no
    // detection code at all and every unchosen visitor lands on English.
    autodetectLocale?: boolean;
}

export const buildBootScript = ({ autodetectLocale = false }: BootScriptOptions = {}): string => {
    // A stored 'en' is an explicit choice and outranks detection, which is what
    // lets a ko-browser visitor pick English once and keep it. The script never
    // writes bs-locale: detection must not masquerade as a choice.
    const locale =
        "var l=localStorage.getItem('bs-locale');" +
        "if(l!=='ko'&&l!=='ja'&&l!=='en'){" +
        (autodetectLocale ? DETECT_LOCALE : "l='en';") +
        '}' +
        'document.documentElement.lang=l;' +
        'document.documentElement.dataset.lang=l;';

    return `(function(){${THEME_AND_REALM}${locale}})();`;
};
