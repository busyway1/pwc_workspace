import { Show, createEffect, createSignal, onMount } from "solid-js";
import Button from "../components/button";
import LiveMarkdownEditor from "../components/live-markdown-editor";
import { AlertTriangle, FileText, RefreshCw, Save } from "lucide-solid";

export type InstructionsViewProps = {
  busy: boolean;
  content: string;
  lastModified: string | null;
  loadInstructions: () => Promise<void>;
  saveInstructions: (
    content: string,
  ) => Promise<{ ok: boolean; message: string }>;
};

export default function InstructionsView(props: InstructionsViewProps) {
  const [draft, setDraft] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);

  createEffect(() => {
    setDraft(props.content);
    setDirty(false);
  });

  onMount(() => {
    props.loadInstructions();
  });

  const handleChange = (value: string) => {
    setDraft(value);
    setDirty(value !== props.content);
  };

  const handleSave = async () => {
    if (!dirty() || saving()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await props.saveInstructions(draft());
      if (result.ok) {
        setDirty(false);
        setToast("Instructions saved");
        setTimeout(() => setToast(null), 3000);
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(props.content);
    setDirty(false);
    setError(null);
  };

  return (
    <section class="space-y-6">
      <Show when={toast()}>
        <div class="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-dls-border bg-dls-surface px-4 py-3 text-xs text-dls-text shadow-2xl">
          {toast()}
        </div>
      </Show>

      <div class="space-y-2">
        <h2 class="text-3xl font-bold text-dls-text">System Instructions</h2>
        <p class="text-sm text-dls-secondary">
          Define global behavior guidelines for the AI agent in this workspace.
          These instructions are prepended to every conversation as a system
          prompt.
        </p>
      </div>

      <div class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div class="text-xs text-amber-800 dark:text-amber-200">
          <strong>Enterprise Notice:</strong> Instructions defined here apply to
          all sessions in this workspace. Use this to enforce audit guidelines,
          security policies, and compliance requirements.
        </div>
      </div>

      <div class="rounded-2xl border border-dls-border bg-dls-surface shadow-sm">
        <div class="flex items-center justify-between border-b border-dls-border px-4 py-3">
          <div class="flex items-center gap-2">
            <FileText class="h-4 w-4 text-dls-secondary" />
            <span class="text-xs font-medium text-dls-secondary">
              .opencode/instructions.md
            </span>
            <Show when={props.lastModified}>
              <span class="text-[10px] text-dls-secondary">
                Last saved: {new Date(props.lastModified!).toLocaleString()}
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <Show when={dirty()}>
              <span class="text-[10px] font-medium text-amber-600">
                Unsaved changes
              </span>
            </Show>
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={!dirty() || saving()}
              class="px-3 py-1.5 text-xs"
            >
              <RefreshCw class="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!dirty() || saving() || props.busy}
              class="px-3 py-1.5 text-xs"
            >
              <Save class="h-3.5 w-3.5" />
              {saving() ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div class="min-h-[400px] p-4">
          <LiveMarkdownEditor
            value={draft()}
            onChange={handleChange}
            placeholder={
              "# Workspace Instructions\n\nWrite markdown instructions that will be included in every AI conversation.\n\nExample:\n- Always respond in Korean\n- Follow PwC audit methodology\n- Never disclose confidential client data"
            }
            ariaLabel="System instructions editor"
          />
        </div>
      </div>

      <Show when={error()}>
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error()}
        </div>
      </Show>
    </section>
  );
}
