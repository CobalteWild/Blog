'use strict';

/**
 * 1) 给真正包含公式的页面注入 KaTeX 样式。
 * 2) 关掉 Nunjucks 对文章内容的解析。
 *
 * 第 2 点很关键：Hexo 的 Swig 标签转义只处理「完整」的 {{ }} / {% %} / {# #}，
 * 像 LaTeX 颜色写法 \color {#C0C0C0} 里的 {# 没有配对的 #}，
 * 会被 Nunjucks 当成未闭合注释，构建直接报 expected end of comment。
 * 这个博客不使用 Hexo 的 {% %} 标签语法，关掉没有副作用。
 */
const KATEX_CSS = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">';

hexo.extend.filter.register('after_init', function () {
  const renderer = hexo.render.renderer.get('md');
  if (renderer) renderer.disableNunjucks = true;
});

// 引用块里的 ">文字"（> 后没有空格）在 fenced code 内会让 markdown-it 把 ">" 留在代码里。
// 渲染前补空格，渲染后再对代码块兜底清理一次。
hexo.extend.filter.register('before_post_render', function (data) {
  // 引用块里 ">文字" 缺空格时，fenced code 内会把 > 留在代码里
  data.content = data.content.replace(/^>(\S)/gm, '> $1');

  // 行内公式两端有空白时 markdown-it-katex 会直接跳过（$ x $ 原样输出），
  // 这里去掉首尾空白，$$ 块不受影响。
  data.content = data.content.replace(
    /\$(?!\$)([ \t]*)([^$\n]+?)([ \t]*)\$(?!\$)/g,
    function (m, a, inner) {
      if (!inner.trim()) return m;
      return '$' + inner.trim() + '$';
    }
  );

  // 任务列表项里的 ATX 标题（- [ ] ##### xxx）改成 HTML 标题。
  // markdown-it 不支持列表项内写标题（##### 不在行首），Typora 支持；这里等价实现。
  data.content = data.content.replace(
    /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\][ \t]+(#{1,6})[ \t]+(.+)$/gm,
    function (m, prefix, mark, hashes, content) {
      var level = hashes.length;
      var checked = mark.toLowerCase() === 'x' ? ' checked' : '';
      var inner = content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      return prefix + '<input type="checkbox" class="task-list-item-checkbox" disabled'
        + checked + '> <h' + level + '>' + inner + '</h' + level + '>';
    }
  );

  return data;
});

// KaTeX 会把公式输出两份（MathML + 视觉 HTML），直接抽文本会让标题重复一遍，
// 这里把标题内的 MathML 副本去掉，同时清理正文里的 [toc] 占位。
hexo.extend.filter.register('after_post_render', function (data) {
  data.content = data.content.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/g, function (m, lvl, attrs, inner) {
    var cleaned = inner.replace(/<span class="katex-mathml"><math[\s\S]*?<\/math><\/span>/g, '');
    return '<h' + lvl + attrs + '>' + cleaned + '</h' + lvl + '>';
  });
  data.content = data.content.replace(/<p>\[toc\]<\/p>/gi, '');
  // 未闭合的 <font size=4> 会把后面所有 DOM（含侧边栏）包进去，导致 sticky 失效。
  // 只删带 size 的开标签，color 的保留。
  data.content = data.content.replace(/<font\s+size\s*=\s*["']?\d+["']?\s*>/gi, '');
  // 博客园图床有防盗链，带本站 Referer 会 403，图片标签统一不发送 Referer
  data.content = data.content.replace(/<img /g, '<img referrerpolicy="no-referrer" ');
  // 兜底：去掉代码块每行开头被误留下的 ">"
  data.content = data.content.replace(/(<figure class="highlight[^"]*">[\s\S]*?<\/figure>)/g, function (block) {
    return block.replace(/<span class="line">&gt;/g, '<span class="line">');
  });
  return data;
});

hexo.extend.filter.register('after_render:html', function (str) {
  // 加密文章的公式在密文里，HTML 里查不到 class="katex"，但解密后会显示出来，
  // 所以页面上出现了加密容器时也要注入样式，否则 MathML 会裸露、公式重复一遍。
  if (!str.includes('class="katex"') && !str.includes('id="hexo-blog-encrypt"')) return str;
  if (str.includes('katex.min.css')) return str;
  if (!str.includes('</head>')) return str;
  return str.replace('</head>', `  ${KATEX_CSS}\n</head>`);
});
