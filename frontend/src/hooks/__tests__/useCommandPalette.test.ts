/**
 * useCommandPalette — register/cleanup actions, open/close, query state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  Events: { CMD_PALETTE_OPENED: "cmd_palette_opened" },
}));

import {
  useCommandPalette,
  useCommandPaletteStore,
  useRegisterCommands,
  type CommandAction,
} from "../useCommandPalette";

describe("useCommandPalette", () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ open: false, query: "", actions: [] });
  });

  it("toggle opens and closes", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("registers actions and cleans up on unmount", () => {
    const action: CommandAction = {
      id: "a-1",
      section: "Test",
      label: "Do thing",
      perform: vi.fn(),
    };

    const { unmount, result } = renderHook(() => {
      useRegisterCommands([action]);
      return useCommandPalette();
    });

    expect(result.current.actions.find((a) => a.id === "a-1")).toBeDefined();

    unmount();
    expect(useCommandPaletteStore.getState().actions.find((a) => a.id === "a-1")).toBeUndefined();
  });

  it("setQuery updates store", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.setQuery("deploy"));
    expect(result.current.query).toBe("deploy");
  });

  it("setOpen(true) clears query", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.setQuery("foo"));
    act(() => result.current.setOpen(true));
    expect(result.current.query).toBe("");
  });
});
