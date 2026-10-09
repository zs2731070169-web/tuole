// Electron 原生保存面板确认后才调用，避免在弹窗前加载 SheetJS。
// 与 src/lib/excel.ts 的浏览器版保持同构：标签/分组列插在备注之后，创建/完成时间列号随之右移。

// 执行期 = 日期集合（2026-10-09 模型改造）。与浏览器版同构：
// 连续 = 安排日期列首日 + 截止日期列末日；分散 = 安排日期列顿号连接全量列表、截止列留空
function excelScheduledCell(task) {
  const dates = Array.isArray(task.scheduledDates) ? task.scheduledDates.slice().sort() : [];
  if (dates.length <= 1) return dates[0] ?? "";
  return isContiguousDayKeys(dates) ? dates[0] : dates.join("、");
}

function excelEndDateCell(task) {
  const dates = Array.isArray(task.scheduledDates) ? task.scheduledDates.slice().sort() : [];
  return dates.length > 1 && isContiguousDayKeys(dates) ? dates[dates.length - 1] : "";
}

// 日期键连续性：末-首天数差 + 1 === 数量（YYYY-MM-DD 字符串直接做 Date 差）
function isContiguousDayKeys(dates) {
  const first = new Date(`${dates[0]}T00:00:00`);
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`);
  const dayMs = 86400000;
  return Math.round((last - first) / dayMs) + 1 === dates.length;
}
const EXCEL_HEADERS = ["序号", "标题", "备注", "标签", "分组", "优先级", "安排日期", "截止日期", "创建时间", "完成时间"];
const TODO_HEADERS = ["所属任务序号", "所属任务标题", "待办项", "已完成"];
const META_SHEET = "__妥了关联";
const PRIORITY_LABEL = { high: "高", medium: "中", low: "低", none: "无" };

function excelLocalDateTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const wall = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
  return (wall - Date.UTC(1899, 11, 30)) / 86400000;
}

function buildExcelBuffer(tasks) {
  const XLSX = require("xlsx");
  const rows = tasks.map((task, index) => ({
    序号: index + 1,
    标题: task.title,
    备注: task.note,
    标签: Array.isArray(task.tags) ? task.tags.join("、") : "",
    分组: typeof task.group === "string" ? task.group : "",
    优先级: PRIORITY_LABEL[task.priority] ?? "无",
    安排日期: excelScheduledCell(task),
    截止日期: excelEndDateCell(task),
    创建时间: "",
    完成时间: "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
  tasks.forEach((task, index) => {
    // 标签/分组列插在备注之后：创建/完成时间列号随之右移两位（8/9）
    for (const [column, iso] of [[8, task.createdAt], [9, task.completedAt]]) {
      const serial = excelLocalDateTime(iso);
      if (serial !== null) {
        worksheet[XLSX.utils.encode_cell({ r: index + 1, c: column })] = {
          t: "n", v: serial, z: "yyyy-mm-dd hh:mm:ss",
        };
      }
    }
  });
  worksheet["!cols"] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "任务");
  // 任务数据由渲染层经 IPC 传入（store 内已完成旧键迁移），无需兼容旧键
  const todoRows = tasks.flatMap((task, index) =>
    (Array.isArray(task.todos) ? task.todos : []).map((todo) => ({
      所属任务序号: index + 1,
      所属任务标题: task.title,
      待办项: todo.title,
      已完成: todo.done ? "是" : "否",
    })),
  );
  if (todoRows.length > 0) {
    const subSheet = XLSX.utils.json_to_sheet(todoRows, { header: TODO_HEADERS });
    subSheet["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, subSheet, "待办项");
  }
  const meta = XLSX.utils.json_to_sheet(tasks.map((task, index) => ({ 序号: index + 1, 关联: task.id })));
  XLSX.utils.book_append_sheet(workbook, meta, META_SHEET);
  workbook.Workbook = { Sheets: workbook.SheetNames.map((name) => ({ Hidden: name === META_SHEET ? 2 : 0 })) };
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

module.exports = { buildExcelBuffer };
