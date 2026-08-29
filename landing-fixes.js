(() => {
  const applyHeroExample = () => {
    const paper = document.querySelector('.hero-demo .demo-paper');
    const card = document.querySelector('.hero-demo .demo-card');
    if (paper) {
      paper.innerHTML = '<p>その返しがもう <mark class="mark-phrase">ダメだった</mark>。さらにその後の一言もダメだった。最後は笑ってしまった。</p>';
    }
    if (card) {
      card.innerHTML = `
        <div class="demo-card-head">
          <strong>ダメだった</strong>
          <span class="badge">ニュアンス</span>
        </div>
        <div class="nuance-row"><span>スタンス</span><span>含意</span><span>確信度: 高</span></div>
        <p class="demo-gloss">語義：「駄目だった」</p>
        <p><strong>コノテーション</strong><br>面白くて笑いを抑えられなかった</p>
        <p>発言内容への強い面白さや呆れを、くだけた形で示す。</p>
        <p><small>後文で「ダメだった」と繰り返し、最後に笑ったと明示している。</small></p>
      `;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyHeroExample, { once: true });
  } else {
    applyHeroExample();
  }
})();
