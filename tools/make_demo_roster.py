"""生成一份全新的演示名单（人名 / 学号 / 专业均为虚构，且不与用户提供的名单重复）。"""

import json
import random
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

SRC = Path(r"C:\Users\qweasd\Downloads\2024级学生名单.xlsx")
OUT = Path(r"C:\Users\qweasd\Documents\deepseek-harness\default-workspace\callme\docs\演示名单_45人.xlsx")

# ---------- 1. 读出原名单里的姓名，用于避重 ----------
existing_names = set()
if SRC.exists():
    wb = load_workbook(SRC, read_only=True, data_only=True)
    for ws in wb.worksheets:
        rows = ws.iter_rows(values_only=True)
        header = [str(c).strip() if c is not None else "" for c in next(rows, [])]
        if "姓名" not in header:
            continue
        idx = header.index("姓名")
        for row in rows:
            if row and len(row) > idx and row[idx]:
                existing_names.add(str(row[idx]).strip())

# ---------- 2. 造名字 ----------
SURNAMES = list("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦马苗凤花方俞任袁柳")
GIVEN = [
    "明哲", "若彤", "嘉树", "语辰", "承宇", "芷晴", "修远", "沐辰", "疏桐", "亦舟",
    "星河", "望舒", "景行", "清让", "云舟", "竹青", "白露", "澜溪", "望津", "知微",
    "令仪", "稚川", "长风", "见山", "听雨", "映雪", "拾贝", "青禾", "灼华", "归远",
    "棠棣", "淮序", "玉衡", "天权", "瑶光", "开阳", "慕白", "砚青", "南乔", "北屿",
    "临安", "渡川", "砚舟", "星野", "云归", "知白", "守拙", "抱朴", "含章", "聿修",
]

random.seed(20261106)
names = []
tries = 0
while len(names) < 45 and tries < 20000:
    tries += 1
    name = random.choice(SURNAMES) + random.choice(GIVEN)
    if name in existing_names or name in names:
        continue
    names.append(name)

if len(names) < 45:
    raise SystemExit(f"只生成了 {len(names)} 个不重复姓名，请补充候选字")

# ---------- 3. 专业 / 班级（与用户名单里的专业不重叠） ----------
MAJORS = [
    ("网络工程", "2024级 网络工程 1班"),
    ("物联网工程", "2024级 物联网工程 1班"),
    ("智能科学与技术", "2024级 智能科学 1班"),
    ("数字媒体技术", "2024级 数字媒体 1班"),
    ("空间信息与数字技术", "2024级 空间信息 1班"),
]

students = []
for i, name in enumerate(names, start=1):
    major, klass = MAJORS[(i - 1) % len(MAJORS)]
    student_no = f"2024{i:04d}"  # 8 位，前缀 2024，与用户名单的 9 位编号明显不同
    students.append((student_no, name, major, klass))

# ---------- 4. 写 Excel ----------
wb = Workbook()
ws = wb.active
ws.title = "学生名单"

headers = ["学号", "姓名", "专业", "班级"]
ws.append(headers)
for row in students:
    ws.append(list(row))

header_fill = PatternFill("solid", fgColor="1F5C46")
thin = Side(style="thin", color="E9E4D7")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

for col in range(1, len(headers) + 1):
    cell = ws.cell(row=1, column=col)
    cell.font = Font(bold=True, color="FFFFFF", size=11)
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = border

for r in range(2, len(students) + 2):
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=r, column=c)
        cell.border = border
        cell.alignment = Alignment(vertical="center", horizontal="center" if c in (1, 4) else "left")

widths = {"A": 14, "B": 12, "C": 26, "D": 24}
for col, width in widths.items():
    ws.column_dimensions[col].width = width
ws.row_dimensions[1].height = 26
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:D{len(students) + 1}"

# 附一页说明，避免被误认为真实学生数据
note = wb.create_sheet("说明")
note["A1"] = "关于这份名单"
note["A1"].font = Font(bold=True, size=13)
note_lines = [
    "1. 本文件中的所有姓名、学号、专业、班级均为虚构，仅用于课堂点名系统的功能演示。",
    "2. 学号为 8 位（2024 开头），专业为网络工程 / 物联网工程 / 智能科学与技术 / 数字媒体技术 / 空间信息与数字技术。",
    "3. 数据与任何真实学生名单无关，如与真实姓名雷同纯属巧合。",
    "4. 导入方式：系统「学生名单」页 → 导入 Excel；或命令行 node tools/import-roster.mjs <文件路径> --reset",
]
for i, text in enumerate(note_lines, start=3):
    note[f"A{i}"] = text
note.column_dimensions["A"].width = 100

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)

print(json.dumps({
    "output": str(OUT),
    "count": len(students),
    "sample": students[:6],
    "majors": sorted({s[2] for s in students}),
    "name_overlap_with_user_file": sorted(set(names) & existing_names),
}, ensure_ascii=False, indent=1))
