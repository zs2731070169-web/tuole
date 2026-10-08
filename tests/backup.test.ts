// 自动备份引擎纯逻辑回归：快照结构 / 滚动淘汰 / 备份文件解析
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBackup,
  saveSnapshot,
  saveCurrentSnapshot,
  parseBackupFile,
  replaceTasksWithRecoveryPoint,
  MAX_BACKUPS,
} from "../src/services/backup";
import { loadBackups } from "../src/lib/storage";
import { useTaskStore } from "../src/stores/useTaskStore";
import type { Task } from "../src/shared/types";

// node 测试环境没有 DOM：内存 Map 桩替换 localStorage（backup 的快照读写走 storage.ts）
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  removeItem: (key: string) => void memoryStorage.delete(key),
});

beforeEach(() => memoryStorage.clear());

function makeTask(seq: number): Task {
  return {
    id: `t${seq}`,
    title: `任务${seq}`,
    note: "",
    priority: "none",
    scheduledDate: "2026-10-07",
    dueDate: null,
    subtasks: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    completedReason: null,
    sortOrder: seq,
  };
}

describe("createBackup", () => {
  it("快照携带全量任务副本与元信息", () => {
    const tasks = [makeTask(1), makeTask(2)];
    const backup = createBackup(tasks, new Date("2026-10-07T10:30:00Z"));
    expect(backup.taskCount).toBe(2);
    expect(backup.tasks).toHaveLength(2);
    expect(backup.createdAt).toBe("2026-10-07T10:30:00.000Z");
    // 副本隔离：改原数组不影响快照内容
    tasks[0].title = "changed";
    expect(backup.tasks[0].title).toBe("任务1");
  });
});

describe("saveSnapshot 滚动淘汰", () => {
  it("最新在队首，超过 MAX_BACKUPS 份淘汰最旧", () => {
    for (let i = 1; i <= MAX_BACKUPS + 5; i++) {
      saveSnapshot(createBackup([makeTask(i)], new Date(2026, 9, 7, 10, i)));
    }
    const backups = loadBackups();
    expect(backups).toHaveLength(MAX_BACKUPS);
    // 队首应是最后一次（minute = MAX_BACKUPS+5）
    expect(backups[0].id).toBe(`bk-${new Date(2026, 9, 7, 10, MAX_BACKUPS + 5).getTime()}`);
    // 最旧的 1..5 号已被淘汰
    expect(backups.some((b) => b.id === `bk-${new Date(2026, 9, 7, 10, 1).getTime()}`)).toBe(false);
  });

  it("同 id 重复写入不产生重复条目", () => {
    const backup = createBackup([makeTask(1)], new Date(2026, 9, 7, 10, 30));
    saveSnapshot(backup);
    saveSnapshot(backup);
    expect(loadBackups()).toHaveLength(1);
  });
});

describe("parseBackupFile", () => {
  const tasks = [makeTask(1), makeTask(2)];

  it("接受导出格式 {tasks:[...]} 与纯数组", () => {
    expect(parseBackupFile(JSON.stringify({ version: 1, tasks }))).toHaveLength(2);
    expect(parseBackupFile(JSON.stringify(tasks))).toHaveLength(2);
  });

  it("坏 JSON / 非法结构 / 空任务列表返回 null", () => {
    expect(parseBackupFile("{not-json")).toBeNull();
    expect(parseBackupFile('{"foo":1}')).toBeNull();
    expect(parseBackupFile("[]")).toBeNull();
    expect(parseBackupFile(JSON.stringify({ tasks: [{ id: "x" }] }))).toBeNull(); // 缺 title/scheduledDate 的条目被过滤后为空
  });

  it("形状不完整的条目被过滤，合法条目保留", () => {
    const mixed = [{ id: "a", title: "ok", scheduledDate: null }, { id: "b" }, "junk"];
    expect(parseBackupFile(JSON.stringify({ tasks: mixed }))).toHaveLength(1);
  });
});

describe("replaceTasksWithRecoveryPoint", () => {
  it("替换任务前先保存当前任务作为恢复点", () => {
    const current = [makeTask(101)];
    const replacement = [makeTask(202)];
    useTaskStore.setState({ tasks: current });

    expect(replaceTasksWithRecoveryPoint(replacement)).toBe(1);
    expect(useTaskStore.getState().tasks).toEqual(replacement);
    expect(loadBackups()[0].tasks).toEqual(current);
  });
});

describe("无任务不备份（2026-10 用户决策）", () => {
  it("零任务时 saveCurrentSnapshot 直接跳过，不产生快照", () => {
    useTaskStore.setState({ tasks: [] });
    expect(saveCurrentSnapshot(new Date("2026-10-08T10:00:00Z"))).toBeNull();
    expect(loadBackups()).toEqual([]);
  });

  it("零任务时替换导入也不留空恢复点；有任务后恢复拍摄", () => {
    useTaskStore.setState({ tasks: [] });
    replaceTasksWithRecoveryPoint([makeTask(301)]);
    expect(loadBackups()).toEqual([]); // 覆盖前无可损失数据，不拍空快照

    useTaskStore.setState({ tasks: [makeTask(302)] });
    expect(saveCurrentSnapshot(new Date("2026-10-08T11:00:00Z"))).not.toBeNull();
    expect(loadBackups()[0].tasks).toHaveLength(1);
  });
});
