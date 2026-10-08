// Electron 原生保存面板确认后才调用，避免在弹窗前加载 SheetJS。
const EXCEL_HEADERS = ["序号", "标题", "说明", "优先级", "安排日期", "截止日期", "创建时间", "完成时间"];
const SUBTASK_HEADERS = ["所属任务序号", "所属任务标题", "子任务", "已完成"];
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
    说明: task.note,
    优先级: PRIORITY_LABEL[task.priority] ?? "无",
    安排日期: task.scheduledDate ?? "",
    截止日期: task.dueDate ?? "",
    创建时间: "",
    完成时间: "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
  tasks.forEach((task, index) => {
    for (const [column, iso] of [[6, task.createdAt], [7, task.completedAt]]) {
      const serial = excelLocalDateTime(iso);
      if (serial !== null) {
        worksheet[XLSX.utils.encode_cell({ r: index + 1, c: column })] = {
          t: "n", v: serial, z: "yyyy-mm-dd hh:mm:ss",
        };
      }
    }
  });
  worksheet["!cols"] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "任务");
  const subRows = tasks.flatMap((task, index) =>
    (Array.isArray(task.subtasks) ? task.subtasks : []).map((subtask) => ({
      所属任务序号: index + 1,
      所属任务标题: task.title,
      子任务: subtask.title,
      已完成: subtask.done ? "是" : "否",
    })),
  );
  if (subRows.length > 0) {
    const subSheet = XLSX.utils.json_to_sheet(subRows, { header: SUBTASK_HEADERS });
    subSheet["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, subSheet, "子任务");
  }
  const meta = XLSX.utils.json_to_sheet(tasks.map((task, index) => ({ 序号: index + 1, 关联: task.id })));
  XLSX.utils.book_append_sheet(workbook, meta, META_SHEET);
  workbook.Workbook = { Sheets: workbook.SheetNames.map((name) => ({ Hidden: name === META_SHEET ? 2 : 0 })) };
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

module.exports = { buildExcelBuffer };
