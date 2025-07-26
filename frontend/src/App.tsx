import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChatPage } from '@/pages/ChatPage';
import { AboutPage } from '@/pages/AboutPage';
import { Layout } from '@/components/layout/Layout';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="bill-bot-theme">
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<ChatPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
                    <p className="text-muted-foreground mb-4">
                      The page you're looking for doesn't exist.
                    </p>
                    <a href="/" className="text-primary hover:underline">
                      Return to Chat
                    </a>
                  </div>
                </div>
              } />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;