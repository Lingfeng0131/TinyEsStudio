import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card, Stack, Text } from '@mantine/core';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: ''
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('渲染层异常', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-shell">
          <Card className="error-card" radius="xl" p="xl">
            <Stack gap="md">
              <div>
                <Text fw={800} size="xl">
                  页面出错了
                </Text>
                <Text c="dimmed" mt={6}>
                  已拦截这次渲染异常，避免整个窗口直接白屏。
                </Text>
              </div>
              <Text size="sm">{this.state.errorMessage || '未知错误'}</Text>
              <Button color="pink" onClick={() => window.location.reload()}>
                重新加载
              </Button>
            </Stack>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
