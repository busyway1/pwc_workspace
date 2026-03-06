import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import Button from "../components/button";
import { Edit2, Plus, RefreshCw, Search, Terminal, Trash2 } from "lucide-solid";

type CommandItem = {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string | null;
  subtask?: boolean;
  scope?: "workspace" | "global";
};

export type CommandsViewProps = {
  busy: boolean;
  commands: CommandItem[];
  commandsStatus: string | null;
  refreshCommands: (options?: { force?: boolean }) => void;
  saveCommand: (input: CommandItem) => Promise<void>;
  deleteCommand: (name: string) => Promise<void>;
};

export default function CommandsView(props: CommandsViewProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [toast, setToast] = createSignal<string | null>(null);

  // Create/edit form state
  const [formOpen, setFormOpen] = createSignal(false);
  const [editingName, setEditingName] = createSignal<string | null>(null);
  const [formName, setFormName] = createSignal("");
  const [formDescription, setFormDescription] = createSignal("");
  const [formTemplate, setFormTemplate] = createSignal("");
  const [formAgent, setFormAgent] = createSignal("");
  const [formModel, setFormModel] = createSignal("");
  const [formSubtask, setFormSubtask] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);
  const [formSaving, setFormSaving] = createSignal(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null);

  onMount(() => {
    props.refreshCommands();
  });

  createEffect(() => {
    const message = toast();
    if (!message) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    onCleanup(() => window.clearTimeout(id));
  });

  const filteredCommands = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return props.commands;
    return props.commands.filter((cmd) => {
      const desc = cmd.description ?? "";
      return (
        cmd.name.toLowerCase().includes(query) ||
        desc.toLowerCase().includes(query)
      );
    });
  });

  const openCreateForm = () => {
    setEditingName(null);
    setFormName("");
    setFormDescription("");
    setFormTemplate("");
    setFormAgent("");
    setFormModel("");
    setFormSubtask(false);
    setFormError(null);
    setFormSaving(false);
    setFormOpen(true);
  };

  const openEditForm = (cmd: CommandItem) => {
    setEditingName(cmd.name);
    setFormName(cmd.name);
    setFormDescription(cmd.description ?? "");
    setFormTemplate(cmd.template);
    setFormAgent(cmd.agent ?? "");
    setFormModel(cmd.model ?? "");
    setFormSubtask(cmd.subtask ?? false);
    setFormError(null);
    setFormSaving(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError(null);
  };

  const submitForm = async () => {
    const name = formName().trim();
    const template = formTemplate().trim();

    if (!name) {
      setFormError("Command name is required.");
      return;
    }
    if (!template) {
      setFormError("Command template is required.");
      return;
    }

    // Check for name conflict when creating (not editing)
    if (!editingName()) {
      const existing = props.commands.find((c) => c.name === name);
      if (existing) {
        setFormError(`A command named "${name}" already exists.`);
        return;
      }
    }

    setFormSaving(true);
    setFormError(null);
    try {
      await props.saveCommand({
        name,
        description: formDescription().trim() || undefined,
        template,
        agent: formAgent().trim() || undefined,
        model: formModel().trim() || null,
        subtask: formSubtask(),
      });
      props.refreshCommands({ force: true });
      setToast(
        editingName()
          ? `Command "${name}" updated`
          : `Command "${name}" created`,
      );
      closeForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save command.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await props.deleteCommand(name);
      props.refreshCommands({ force: true });
      setToast(`Command "${name}" deleted`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to delete command.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section class="space-y-8">
      <Show when={toast()}>
        <div class="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-dls-border bg-dls-surface px-4 py-3 text-xs text-dls-text shadow-2xl">
          {toast()}
        </div>
      </Show>

      <div class="space-y-2">
        <h2 class="text-3xl font-bold text-dls-text">Commands</h2>
        <p class="text-sm text-dls-secondary">
          Manage slash commands for this workspace. Commands are templates that
          can be triggered with <code>/command-name</code> in chat.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3 border-b border-dls-border pb-4">
        <button
          type="button"
          onClick={() => props.refreshCommands({ force: true })}
          disabled={props.busy}
          class={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            props.busy
              ? "text-dls-secondary"
              : "text-dls-secondary hover:text-dls-text"
          }`}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <div class="relative">
          <Search
            size={14}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-dls-secondary"
          />
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search commands"
            class="bg-dls-hover border border-dls-border rounded-lg py-1.5 pl-9 pr-4 text-xs w-56 focus:w-72 focus:outline-none transition-all"
          />
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={props.busy}
          class={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            props.busy
              ? "bg-dls-active text-dls-secondary"
              : "bg-dls-text text-dls-surface hover:opacity-90"
          }`}
        >
          <Plus size={14} />
          New command
        </button>
      </div>

      <Show when={props.commandsStatus}>
        <div class="rounded-xl border border-dls-border bg-dls-hover px-4 py-3 text-xs text-dls-secondary whitespace-pre-wrap break-words">
          {props.commandsStatus}
        </div>
      </Show>

      <div class="space-y-4">
        <h3 class="text-[11px] font-bold text-dls-secondary uppercase tracking-widest">
          Installed commands
        </h3>
        <Show
          when={filteredCommands().length}
          fallback={
            <div class="rounded-xl border border-dls-border bg-dls-surface px-5 py-6 text-sm text-dls-secondary">
              No commands found. Create one with the button above.
            </div>
          }
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <For each={filteredCommands()}>
              {(cmd) => (
                <div
                  role="button"
                  tabindex="0"
                  class="bg-dls-surface border border-dls-border rounded-xl p-4 flex items-start justify-between group hover:bg-dls-hover transition-all text-left cursor-pointer"
                  onClick={() => openEditForm(cmd)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (e.isComposing || e.keyCode === 229) return;
                      e.preventDefault();
                      openEditForm(cmd);
                    }
                  }}
                >
                  <div class="flex gap-4 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm border border-dls-border bg-dls-surface">
                      <Terminal size={20} class="text-dls-secondary" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 mb-0.5">
                        <h4 class="text-sm font-semibold text-dls-text truncate">
                          /{cmd.name}
                        </h4>
                      </div>
                      <Show when={cmd.description}>
                        <p class="text-xs text-dls-secondary line-clamp-1">
                          {cmd.description}
                        </p>
                      </Show>
                      <div class="mt-1 flex flex-wrap gap-1.5">
                        <Show when={cmd.agent}>
                          <span class="rounded-md border border-dls-border bg-dls-hover px-1.5 py-0.5 text-[10px] text-dls-secondary">
                            agent: {cmd.agent}
                          </span>
                        </Show>
                        <Show when={cmd.model}>
                          <span class="rounded-md border border-dls-border bg-dls-hover px-1.5 py-0.5 text-[10px] text-dls-secondary">
                            model: {cmd.model}
                          </span>
                        </Show>
                        <Show when={cmd.subtask}>
                          <span class="rounded-md border border-dls-border bg-dls-hover px-1.5 py-0.5 text-[10px] text-dls-secondary">
                            subtask
                          </span>
                        </Show>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="p-1.5 text-dls-secondary hover:text-dls-text hover:bg-dls-active rounded-md transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openEditForm(cmd);
                      }}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      class="p-1.5 text-dls-secondary hover:text-red-11 hover:bg-red-3/10 rounded-md transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(cmd.name);
                      }}
                      disabled={props.busy}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Create/Edit Command Modal */}
      <Show when={formOpen()}>
        <div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="w-full max-w-2xl rounded-2xl border border-dls-border bg-dls-surface shadow-2xl overflow-hidden">
            <div class="px-5 py-4 border-b border-dls-border flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-dls-text">
                  {editingName()
                    ? `Edit command: /${editingName()}`
                    : "Create new command"}
                </div>
                <div class="text-xs text-dls-secondary">
                  {editingName()
                    ? "Modify the command configuration"
                    : "Define a new slash command"}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-dls-hover text-dls-text hover:bg-dls-active transition-colors"
                  onClick={closeForm}
                  disabled={formSaving()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    formSaving() || !formName().trim() || !formTemplate().trim()
                      ? "bg-dls-active text-dls-secondary"
                      : "bg-dls-text text-dls-surface hover:opacity-90"
                  }`}
                  disabled={
                    formSaving() || !formName().trim() || !formTemplate().trim()
                  }
                  onClick={() => void submitForm()}
                >
                  {formSaving()
                    ? "Saving..."
                    : editingName()
                      ? "Update"
                      : "Create"}
                </button>
              </div>
            </div>
            <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <Show when={formError()}>
                <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {formError()}
                </div>
              </Show>
              <div class="space-y-1.5">
                <label class="text-xs font-semibold uppercase tracking-widest text-dls-secondary">
                  Name <span class="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName()}
                  onInput={(e) => setFormName(e.currentTarget.value)}
                  placeholder="my-command"
                  disabled={!!editingName()}
                  class="w-full bg-dls-hover border border-dls-border rounded-lg px-3 py-2 text-xs font-mono text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb)/0.25)] disabled:opacity-50"
                  spellcheck={false}
                />
                <div class="text-[10px] text-dls-secondary">
                  The slash command name users will type (e.g.{" "}
                  <code>/my-command</code>)
                </div>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-semibold uppercase tracking-widest text-dls-secondary">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription()}
                  onInput={(e) => setFormDescription(e.currentTarget.value)}
                  placeholder="Brief description shown in autocomplete"
                  class="w-full bg-dls-hover border border-dls-border rounded-lg px-3 py-2 text-xs text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb)/0.25)]"
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-semibold uppercase tracking-widest text-dls-secondary">
                    Agent
                  </label>
                  <input
                    type="text"
                    value={formAgent()}
                    onInput={(e) => setFormAgent(e.currentTarget.value)}
                    placeholder="(default)"
                    class="w-full bg-dls-hover border border-dls-border rounded-lg px-3 py-2 text-xs text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb)/0.25)]"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-semibold uppercase tracking-widest text-dls-secondary">
                    Model
                  </label>
                  <input
                    type="text"
                    value={formModel()}
                    onInput={(e) => setFormModel(e.currentTarget.value)}
                    placeholder="(default)"
                    class="w-full bg-dls-hover border border-dls-border rounded-lg px-3 py-2 text-xs text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb)/0.25)]"
                  />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="subtask-toggle"
                  checked={formSubtask()}
                  onChange={(e) => setFormSubtask(e.currentTarget.checked)}
                  class="rounded border-dls-border"
                />
                <label for="subtask-toggle" class="text-xs text-dls-secondary">
                  Run as subtask (isolated execution context)
                </label>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-semibold uppercase tracking-widest text-dls-secondary">
                  Template <span class="text-red-500">*</span>
                </label>
                <textarea
                  value={formTemplate()}
                  onInput={(e) => setFormTemplate(e.currentTarget.value)}
                  placeholder={
                    "Analyze the current codebase and provide a summary of:\n- Architecture patterns\n- Key dependencies\n- Potential improvements"
                  }
                  class="w-full min-h-[200px] rounded-xl border border-dls-border bg-dls-hover px-4 py-3 text-xs font-mono text-dls-text focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb)/0.25)]"
                  spellcheck={false}
                />
                <div class="text-[10px] text-dls-secondary">
                  The prompt template sent when the command is invoked. Supports
                  markdown.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Delete confirmation */}
      <Show when={deleteTarget()}>
        <div class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="bg-dls-surface border border-dls-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div class="p-6">
              <h3 class="text-lg font-semibold text-dls-text">
                Delete command?
              </h3>
              <p class="text-sm text-dls-secondary mt-1">
                This will permanently delete the <code>/{deleteTarget()}</code>{" "}
                command.
              </p>
              <div class="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={props.busy}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const name = deleteTarget();
                    if (name) void handleDelete(name);
                  }}
                  disabled={props.busy}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
