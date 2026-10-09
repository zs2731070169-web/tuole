// 日历浮层「复制」（2026-10-10 用户决策迭代：副本一律落「未安排」、不进进行中）——
// 内容字段克隆、身份/时间戳全新、待办项换 id 清 done、完成态清空、插入源紧后；
// 执行期清空并停靠指定日（日历浮层传所属日）兜底今天，由用户拖拽/编辑归位
import { describe, expect, it } from "vitest";
import { useTaskStore, emptyTask } from "../src/stores/useTaskStore";

describe("duplicateTask 整条克隆", () => {
  it("字段全量复制；身份/时间戳全新；待办项换 id 清 done；完成态清空；插入源任务紧后", () => {
    const source = emptyTask({
      id: "src",
      title: "交付周报",
      note: "按模板写",
      priority: "high",
      // 显式给旧时间戳：克隆的「时间戳全新」断言不受同毫秒创建的偶然碰撞影响
      createdAt: "2020-01-01T00:00:00.000Z",
      tags: ["工作"],
      scheduledDates: ["2026-10-10", "2026-10-12"],
      todos: [
        { id: "todo-1", title: "收集数据", done: true },
        { id: "todo-2", title: "写总结", done: false },
      ],
      completedAt: "2026-10-09T08:00:00.000Z",
      completedReason: "manual",
    });
    const other = emptyTask({ id: "other", title: "无关任务" });
    useTaskStore.setState({ tasks: [other, source] });

    const clone = useTaskStore.getState().duplicateTask("src");
    const tasks = useTaskStore.getState().tasks;

    // 数组序（= 日历/概览展示序）：副本紧跟源之后
    expect(tasks.map((task) => task.id)).toEqual(["other", "src", clone!.id]);
    expect(clone).toMatchObject({
      title: "交付周报",
      note: "按模板写",
      priority: "high",
      tags: ["工作"],
      // 副本一律未安排，但日期始终存在并保留在复制所在日
      scheduledDates: ["2026-10-10"],
      parkedDate: null,
      startedAt: null,
      // 完成态/草稿清空：副本 status 完全交给状态机自动派生
      completedAt: null,
      completedReason: null,
      draft: false,
    });
    // 身份/时间戳全新（updatedAt=now 参与提醒「当天新建不双弹」判定）
    expect(clone!.id).not.toBe("src");
    expect(clone!.createdAt).not.toBe(source.createdAt);
    expect(clone!.updatedAt).not.toBe(source.updatedAt);
    // 待办项：标题保留、id 全换、done 一律清零（副本是全新执行）
    expect(clone!.todos).toEqual([
      { id: expect.any(String), title: "收集数据", done: false },
      { id: expect.any(String), title: "写总结", done: false },
    ]);
    expect(clone!.todos[0]!.id).not.toBe("todo-1");
    // 集合字段浅拷：副本改数组不动源
    expect(clone!.tags).not.toBe(source.tags);
    expect(clone!.scheduledDates).not.toBe(source.scheduledDates);
  });

  it("未安排任务克隆保持停靠日；不存在的 id 返回 null 且不落库", () => {
    const parked = emptyTask({ id: "parked", title: "停靠任务", parkedDate: "2026-10-10" });
    useTaskStore.setState({ tasks: [parked] });
    const clone = useTaskStore.getState().duplicateTask("parked");
    expect(clone).toMatchObject({ scheduledDates: ["2026-10-10"], parkedDate: null, startedAt: null });

    const before = useTaskStore.getState().tasks;
    expect(useTaskStore.getState().duplicateTask("does-not-exist")).toBeNull();
    expect(useTaskStore.getState().tasks).toBe(before);
  });
});

describe("duplicateTaskToDay ⌥ 拖拽复制 = 单日副本（store 集成）", () => {
  it("副本只落目标日一天；源任务（含散列执行期）零改动；插入源紧后", () => {
    // 用户实测场景（2026-10-10）：源散列 [12,14]，⌥拖 14 的 chip 到 16——
    // 整段平移版会产出 [14,16]（14 号冒出重复 chip、副本跨两天），已废弃勿回
    const source = emptyTask({
      id: "src",
      title: "需求验证",
      tags: ["工作"],
      scheduledDates: ["2026-10-12", "2026-10-14"],
      todos: [{ id: "todo-1", title: "查资料", done: true }],
    });
    useTaskStore.setState({ tasks: [source] });
    const clone = useTaskStore.getState().duplicateTaskToDay("src", "2026-10-16");
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.map((task) => task.id)).toEqual(["src", clone!.id]);
    expect(clone!.scheduledDates).toEqual(["2026-10-16"]); // 单日副本，不带源的其余日期
    expect(tasks[0]!.scheduledDates).toEqual(["2026-10-12", "2026-10-14"]); // 源零改动
    // 克隆字段口径与浮层复制同源（buildTaskClone）
    expect(clone!.todos).toEqual([{ id: expect.any(String), title: "查资料", done: false }]);
    expect(clone!.tags).toEqual(["工作"]);
    expect(clone!.parkedDate).toBeNull();
    expect(clone!.startedAt).toBeNull();
  });

  it("单日源同样只落目标日；不存在 id 返回 null", () => {
    const source = emptyTask({ id: "src", title: "单日", scheduledDates: ["2026-10-14"] });
    useTaskStore.setState({ tasks: [source] });
    expect(useTaskStore.getState().duplicateTaskToDay("src", "2026-10-16")!.scheduledDates).toEqual(["2026-10-16"]);
    const before = useTaskStore.getState().tasks;
    expect(useTaskStore.getState().duplicateTaskToDay("nope", "2026-10-16")).toBeNull();
    expect(useTaskStore.getState().tasks).toBe(before);
  });
});

describe("duplicateTask 停靠日参数", () => {
  it("传 parkedOn = 副本停靠指定日（日历浮层所属日）", () => {
    const source = emptyTask({ id: "src2", title: "带日期的源", scheduledDates: ["2026-10-10"] });
    useTaskStore.setState({ tasks: [source] });
    const clone = useTaskStore.getState().duplicateTask("src2", "2026-11-20");
    expect(clone).toMatchObject({ scheduledDates: ["2026-11-20"], parkedDate: null, startedAt: null });
  });
});
