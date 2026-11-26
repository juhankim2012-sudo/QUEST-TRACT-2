// 저장하는 코드는 전부 여기에만 둔다. (지금은 이 기기의 브라우저 localStorage)
// 나중에 보관함(서버)을 붙일 때 이 파일 안만 바꾸면 된다.
const Store = (() => {
  const KEY = "week07-drawings";
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  };
  const save = (list) => localStorage.setItem(KEY, JSON.stringify(list));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
    list: () => load(),
    addDrawing(title, image) {
      const list = load();
      list.unshift({ id: newId(), title, image, created: Date.now(), comments: [] });
      save(list);
    },
    addComment(drawingId, text) {
      const list = load();
      const d = list.find((x) => x.id === drawingId);
      if (!d) return;
      d.comments.push({ id: newId(), text, created: Date.now() });
      save(list);
    },
    removeDrawing(drawingId) {
      save(load().filter((x) => x.id !== drawingId));
    },
  };
})();
