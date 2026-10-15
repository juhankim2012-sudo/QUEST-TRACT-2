"""
봉고캣 - 키보드를 누를 때마다 캐릭터가 손을 내린다.
다른 창을 쓰고 있을 때도 반응한다.

실행: python bongo_cat.py
끄기: 캐릭터를 오른쪽 클릭 → 끄기
옮기기: 캐릭터를 왼쪽 클릭한 채로 끌기

※ 어떤 키를 눌렀는지는 어디에도 저장하지 않는다.
   "왼쪽 키인지 오른쪽 키인지"와 "누른 횟수"만 쓴다.
"""
import ctypes
import queue
import threading
import time
import tkinter as tk
from ctypes import wintypes
from pathlib import Path

# ===== 설정 =====
SIZE = 250            # 캐릭터 크기 (픽셀)
SLEEP_AFTER = 5       # 이 시간(초) 동안 안 누르면 졸기
HAND_MIN_TIME = 0.08  # 손이 내려와 있는 최소 시간(초). 짧게 톡 쳐도 보이게
FOLDER = Path(__file__).parent
CLEAR = "#010203"     # 투명하게 만들 색 (그림에 이 색은 쓰지 않기)

# 키보드 왼쪽에 있는 키 (나머지는 전부 오른쪽)
LEFT_KEYS = {
    0x1B,              # Esc
    0xC0,              # ` ~
    0x09,              # Tab
    0x14,              # Caps Lock
    0xA0, 0xA2, 0xA4,  # 왼쪽 Shift, Ctrl, Alt
    0x5B,              # 왼쪽 윈도우 키
}
LEFT_KEYS |= {ord(c) for c in "12345QWERTASDFGZXCVB"}

# ===== 모든 창의 키 입력 듣기 (윈도우 기능 사용) =====
WH_KEYBOARD_LL = 13
WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP = 0x100, 0x101, 0x104, 0x105
LRESULT = ctypes.c_ssize_t


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [("vkCode", wintypes.DWORD), ("scanCode", wintypes.DWORD),
                ("flags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.c_size_t)]


HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.SetWindowsHookExW.argtypes = (ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD)
user32.SetWindowsHookExW.restype = wintypes.HHOOK
user32.CallNextHookEx.argtypes = (wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
user32.CallNextHookEx.restype = LRESULT
kernel32.GetModuleHandleW.restype = wintypes.HMODULE

events = queue.Queue()  # ("down" 또는 "up", "left" 또는 "right", 키 번호)


def listen_keys():
    def on_key(code, wparam, lparam):
        if code == 0:
            vk = ctypes.cast(lparam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents.vkCode
            side = "left" if vk in LEFT_KEYS else "right"
            if wparam in (WM_KEYDOWN, WM_SYSKEYDOWN):
                events.put(("down", side, vk))
            elif wparam in (WM_KEYUP, WM_SYSKEYUP):
                events.put(("up", side, vk))
        return user32.CallNextHookEx(None, code, wparam, lparam)

    proc = HOOKPROC(on_key)  # 지워지지 않게 붙잡아 두기
    hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, proc, kernel32.GetModuleHandleW(None), 0)
    if not hook:
        events.put(("error", "", 0))
        return
    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        pass


# ===== 창 만들기 =====
root = tk.Tk()
root.overrideredirect(True)            # 제목 줄 없애기
root.attributes("-topmost", True)      # 항상 맨 위
root.attributes("-transparentcolor", CLEAR)
root.config(bg=CLEAR)

TEXT_H = 40
canvas = tk.Canvas(root, width=SIZE, height=SIZE + TEXT_H, bg=CLEAR, highlightthickness=0)
canvas.pack()


def load(name):
    path = FOLDER / name
    if not path.exists():
        raise SystemExit(f"그림 파일이 없어요: {path}")
    img = tk.PhotoImage(file=str(path))
    # 그림 크기를 SIZE 에 맞추기 (가로 기준)
    w = img.width()
    if w != SIZE:
        from math import gcd
        g = gcd(SIZE, w)
        img = img.zoom(SIZE // g).subsample(w // g)
    return img


pics = {name: load(f"{name}.png") for name in ("idle", "left", "right", "sleep")}
character = canvas.create_image(SIZE // 2, SIZE // 2, image=pics["idle"])
# 어떤 바탕화면 위에서도 숫자가 보이게 어두운 이름표를 깔기
count_box = canvas.create_rectangle(0, 0, 0, 0, fill="#333333", outline="")
count_text = canvas.create_text(SIZE // 2, SIZE + TEXT_H // 2, text="0",
                                fill="white", font=("Segoe UI", 16, "bold"))


def fit_box():
    x0, y0, x1, y1 = canvas.bbox(count_text)
    canvas.coords(count_box, x0 - 12, y0 - 2, x1 + 12, y1 + 2)

# 처음 위치: 화면 오른쪽 아래
root.update_idletasks()
x = root.winfo_screenwidth() - SIZE - 40
y = root.winfo_screenheight() - SIZE - TEXT_H - 80
root.geometry(f"+{x}+{y}")

# ===== 마우스로 끌기, 오른쪽 클릭 메뉴 =====
drag = {"x": 0, "y": 0}


def drag_start(e):
    drag["x"], drag["y"] = e.x, e.y


def drag_move(e):
    root.geometry(f"+{e.x_root - drag['x']}+{e.y_root - drag['y']}")


menu = tk.Menu(root, tearoff=0)
menu.add_command(label="끄기", command=root.destroy)

canvas.bind("<ButtonPress-1>", drag_start)
canvas.bind("<B1-Motion>", drag_move)
canvas.bind("<Button-3>", lambda e: menu.tk_popup(e.x_root, e.y_root))

# ===== 키 반응 =====
held = set()        # 지금 누르고 있는 키 (꾹 누를 때 여러 번 세지 않으려고)
count = 0
last_press = time.time()
hand = None         # 지금 내려와 있는 손: "left", "right", None
hand_since = 0.0


def update():
    global count, last_press, hand, hand_since
    now = time.time()
    while not events.empty():
        kind, side, vk = events.get()
        if kind == "error":
            raise SystemExit("키 입력을 들을 수 없어요.")
        if kind == "down" and vk not in held:
            held.add(vk)
            count += 1
            last_press = now
            hand, hand_since = side, now
        elif kind == "up":
            held.discard(vk)

    # 키를 다 떼고 잠깐 지나면 손 올리기
    if hand and not held and now - hand_since >= HAND_MIN_TIME:
        hand = None

    if hand:
        pic = hand
    elif now - last_press >= SLEEP_AFTER:
        pic = "sleep"
    else:
        pic = "idle"
    canvas.itemconfig(character, image=pics[pic])
    canvas.itemconfig(count_text, text=f"{count:,}")
    fit_box()
    root.after(15, update)


threading.Thread(target=listen_keys, daemon=True).start()
update()
root.mainloop()
