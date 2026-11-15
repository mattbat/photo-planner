const LIGHT = ['#2f6fed', '#e2603a', '#2a9d6f', '#9b51d8', '#d99a00', '#d6407f', '#1f9fb5', '#7a8a2a'];
const DARK = ['#6b9bff', '#ff8a63', '#4cc79a', '#c08cf2', '#f2bb3a', '#f27aa8', '#4cc6dc', '#b2c24f'];
const vars = (c: string[]) => c.map((v, i) => `--branch-${i}:${v};`).join('');

export function treeCss(theme: 'auto' | 'light') {
  const light = `.ft{${vars(LIGHT)}--ft-card:#fff;--ft-text:#1c1c1e;--ft-sub:#6b6b70;--ft-line:#8e8e93;--ft-bg:#f6f6f8;--ft-hh:#b0b0b8;}`;
  const dark = `.ft{${vars(DARK)}--ft-card:#2c2c2e;--ft-text:#f2f2f7;--ft-sub:#a1a1a8;--ft-line:#8e8e93;--ft-bg:#1c1c1e;--ft-hh:#5a5a60;}`;
  const auto = `@media (prefers-color-scheme: dark){:root:not([data-theme='light']) ${dark}}:root[data-theme='dark'] ${dark}`;
  return light + (theme === 'auto' ? auto : '') +
    '.ft text{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif}' +
    '.ft .card{cursor:pointer}.ft .card:focus{outline:none}.ft .card:focus-visible rect.box{stroke-width:3}';
}
