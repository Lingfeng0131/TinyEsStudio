import { useEffect, useMemo, useRef } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { Badge, Button, Card, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import * as monaco from 'monaco-editor';
import type * as MonacoEditor from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import type { IndexFieldOption } from '../../../shared/types';
import {
  DSL_DARK_THEME_ID,
  DSL_LANGUAGE_ID,
  DSL_THEME_ID,
  ensureDslLanguage,
  registerDslCompletionProvider
} from '../utils/dslMonaco';
import { showAppNotification } from '../utils/appNotifications';

interface DslWorkspaceProps {
  selectedIndex?: string;
  availableIndices: string[];
  fieldOptions: IndexFieldOption[];
  themeMode: 'light' | 'dark';
  dslRequest: string;
  dslResponse: string;
  dslStatusCode?: number;
  dslExecuting: boolean;
  onChangeDslRequest: (value: string) => void;
  onExecuteDsl: () => void;
  onClearDsl: () => void;
}

type Monaco = typeof MonacoEditor;

let monacoWorkerReady = false;
let monacoLoaderReady = false;

function ensureMonacoBootstrap(): void {
  if (typeof self === 'undefined') {
    return;
  }

  if (!monacoWorkerReady) {
    const monacoGlobal = self as typeof self & {
      MonacoEnvironment?: {
        getWorker: (_: unknown, label: string) => Worker;
      };
    };

    monacoGlobal.MonacoEnvironment = {
      getWorker(_: unknown, label: string) {
        if (label === 'json') {
          return new jsonWorker();
        }

        return new editorWorker();
      }
    };

    monacoWorkerReady = true;
  }

  if (!monacoLoaderReady) {
    loader.config({ monaco });
    monacoLoaderReady = true;
  }
}

ensureMonacoBootstrap();

export function DslWorkspace({
  selectedIndex,
  availableIndices,
  fieldOptions,
  themeMode,
  dslRequest,
  dslResponse,
  dslStatusCode,
  dslExecuting,
  onChangeDslRequest,
  onExecuteDsl,
  onClearDsl
}: DslWorkspaceProps) {
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionProviderRef = useRef<MonacoEditor.IDisposable | null>(null);

  const completionContext = useMemo(
    () => ({
      selectedIndex,
      availableIndices,
      fieldOptions
    }),
    [availableIndices, fieldOptions, selectedIndex]
  );

  const handleCopyResponse = async (): Promise<void> => {
    if (!dslResponse) {
      showAppNotification({
        id: 'dsl-copy-empty',
        color: 'gray',
        title: '暂无可复制内容',
        message: '请先执行 DSL，再复制响应结果',
        autoClose: 1800
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(dslResponse);
      showAppNotification({
        id: 'dsl-copy-success',
        color: 'pink',
        title: '复制成功',
        message: '响应结果已完整复制到剪贴板',
        autoClose: 1800
      });
    } catch (error) {
      showAppNotification({
        id: 'dsl-copy-failed',
        color: 'red',
        title: '复制失败',
        message: error instanceof Error ? error.message : '当前环境暂时无法写入剪贴板',
        autoClose: 2200
      });
    }
  };

  const handleFormatRequest = async (): Promise<void> => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    await editor.getAction('editor.action.formatDocument')?.run();
  };

  const handleEditorBeforeMount = (monaco: Monaco): void => {
    ensureDslLanguage(monaco);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    ensureDslLanguage(monaco);
  };

  useEffect(() => {
    if (!monacoRef.current) {
      return;
    }

    completionProviderRef.current?.dispose();
    completionProviderRef.current = registerDslCompletionProvider(monacoRef.current, completionContext);

    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
    };
  }, [completionContext]);

  return (
    <Card radius="xl" p="lg" className="grid-card dsl-workspace-card no-drag">
      <div className="dsl-workspace-header">
        <Stack gap={4} className="dsl-workspace-heading">
          <Text fw={800} size="lg" className="dsl-workspace-title">
            DSL 控制台
          </Text>
          <Text size="sm" c="dimmed" className="dsl-workspace-subtitle">
            独立 REST Console
          </Text>
        </Stack>

        <Group gap="xs" wrap="wrap" justify="flex-end">
          <Badge radius="xl" color="pink" variant="light">
            REST Console
          </Badge>
          <Button size="sm" variant="subtle" color="gray" onClick={() => void handleFormatRequest()}>
            格式化
          </Button>
          <Button size="sm" variant="subtle" color="gray" onClick={onClearDsl}>
            清空
          </Button>
          <Button size="sm" color="pink" loading={dslExecuting} onClick={onExecuteDsl}>
            执行
          </Button>
        </Group>
      </div>

      <div className="dsl-workspace-body">
        <div className="dsl-console-shell">
          <div className="dsl-console-editor">
            <div className="dsl-console-head">
              <Text fw={700} size="sm">
                DSL 请求
              </Text>
              <Text size="xs" c="dimmed" className="dsl-console-head-copy">
                支持方法、路径、索引名、字段名和常用 DSL 片段补全；按回车或 Tab 可快速接受建议。
              </Text>
            </div>
            <div className="dsl-console-monaco-shell">
              <Editor
                loading={<div className="dsl-editor-loading">正在加载编辑器...</div>}
                beforeMount={handleEditorBeforeMount}
                onMount={handleEditorMount}
                language={DSL_LANGUAGE_ID}
                theme={themeMode === 'dark' ? DSL_DARK_THEME_ID : DSL_THEME_ID}
                value={dslRequest}
                onChange={(value) => onChangeDslRequest(value ?? '')}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: '"SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace',
                  fontLigatures: false,
                  lineNumbers: 'on',
                  lineDecorationsWidth: 8,
                  glyphMargin: false,
                  folding: true,
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  wordWrap: 'on',
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: true
                  },
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'smart',
                  tabCompletion: 'on',
                  snippetSuggestions: 'top',
                  padding: {
                    top: 16,
                    bottom: 16
                  }
                }}
              />
            </div>
          </div>

          <div className="dsl-console-response">
            <div className="dsl-console-head">
              <Group justify="space-between" align="center">
                <Text fw={700} size="sm">
                  响应结果
                </Text>
                <Group gap="xs" align="center">
                  <UnstyledButton
                    type="button"
                    className="dsl-response-copy-trigger"
                    aria-label="复制响应结果"
                    onClick={() => void handleCopyResponse()}
                  >
                    <Badge
                      radius="xl"
                      color="pink"
                      variant="light"
                      leftSection={<IconCopy size={12} />}
                      className="dsl-response-copy-badge"
                    >
                      复制全部
                    </Badge>
                  </UnstyledButton>
                  {dslStatusCode ? (
                    <Badge radius="xl" color={dslStatusCode >= 400 ? 'red' : 'pink'} variant="light">
                      HTTP {dslStatusCode}
                    </Badge>
                  ) : null}
                </Group>
              </Group>
              <Text size="xs" c="dimmed" className="dsl-console-head-copy">
                执行后这里会显示 Elasticsearch 返回的原始 JSON 结果。
              </Text>
            </div>
            <div className="dsl-console-response-scroll">
              <pre className="dsl-console-response-pre">
                {dslResponse || '点击“执行”后，这里会显示 Elasticsearch 原始 JSON 响应。'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
