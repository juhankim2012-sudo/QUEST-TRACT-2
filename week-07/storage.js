// 저장하는 코드는 전부 여기에만 둔다. (지금은 이 기기의 브라우저 localStorage)
// 나중에 보관함(서버)을 붙일 때 이 파일 안만 바꾸면 된다.
// 남기는 것: 그림, 사람 이름, 댓글
const Store = (() => {
  const KEY = "week07-drawings";
  const NAME_KEY = "week07-my-name";
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  };
  const save = (list) => localStorage.setItem(KEY, JSON.stringify(list));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
    list: () => load(),
    // 기능 1: 이름 기억하기
    getName() {
      try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
    },
    setName(name) {
      try { localStorage.setItem(NAME_KEY, name); } catch { /* 저장 못 해도 그림 올리기는 가능 */ }
    },
    addDrawing(author, title, image) {
      const list = load();
      list.unshift({ id: newId(), author, title, image, created: Date.now(), comments: [] });
      save(list);
    },
    addComment(drawingId, author, text) {
      const list = load();
      const d = list.find((x) => x.id === drawingId);
      if (!d) return;
      d.comments.push({ id: newId(), author, text, created: Date.now() });
      save(list);
    },
    removeDrawing(drawingId) {
      save(load().filter((x) => x.id !== drawingId));
    },
  };
})();
