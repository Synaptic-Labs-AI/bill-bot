import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Database, 
  Zap, 
  Shield, 
  Github, 
  ExternalLink,
  Bot,
  Search,
  MessageSquare,
  BarChart3
} from 'lucide-react';

export function AboutPage() {
  const features = [
    {
      icon: Search,
      title: "Intelligent Search",
      description: "Advanced semantic search across congressional bills using vector embeddings and hybrid search techniques."
    },
    {
      icon: MessageSquare,
      title: "Real-time Streaming",
      description: "Server-sent events provide instant feedback on search progress and streaming responses."
    },
    {
      icon: Database,
      title: "Comprehensive Data",
      description: "Access to current and historical congressional data from official government sources."
    },
    {
      icon: BarChart3,
      title: "Tool Call Transparency",
      description: "See exactly how searches are performed with detailed tool call feedback and iteration tracking."
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "No user data persistence, stateless chat sessions, and privacy-focused design."
    },
    {
      icon: Zap,
      title: "Modern Stack",
      description: "Built with React 19, TypeScript, and cutting-edge web technologies for optimal performance."
    }
  ];

  const technologies = [
    { name: "React 19", description: "Latest React with concurrent features" },
    { name: "TypeScript", description: "Type-safe development" },
    { name: "Vite", description: "Fast build tool and dev server" },
    { name: "shadcn/ui", description: "Modern accessible components" },
    { name: "Tailwind CSS v4", description: "Utility-first styling" },
    { name: "Zustand", description: "Lightweight state management" },
    { name: "Server-Sent Events", description: "Real-time streaming" },
    { name: "OpenRouter API", description: "LLM orchestration" },
    { name: "Supabase", description: "Database and vector search" },
    { name: "Railway", description: "Deployment platform" }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center">
          <Bot className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold mb-4">About Bill Bot</h1>
        <p className="text-xl text-muted-foreground mb-4">
          An AI-powered assistant for exploring U.S. Congressional legislation
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline">Beta</Badge>
          <Badge variant="outline">Open Source</Badge>
          <Badge variant="outline">Privacy-First</Badge>
        </div>
      </div>

      {/* Mission Statement */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Our Mission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">
            Bill Bot democratizes access to congressional information by providing an intuitive, 
            AI-powered interface for exploring legislative bills. We believe that understanding 
            what happens in Congress should be accessible to everyone, not just policy experts. 
            Our platform combines cutting-edge AI technology with comprehensive government data 
            to make legislative research effortless and insightful.
          </p>
        </CardContent>
      </Card>

      {/* Features */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="h-full">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="font-bold">1</span>
              </div>
              <h3 className="font-medium mb-1">Ask a Question</h3>
              <p className="text-xs text-muted-foreground">
                Type your query about congressional bills
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="font-bold">2</span>
              </div>
              <h3 className="font-medium mb-1">AI Search</h3>
              <p className="text-xs text-muted-foreground">
                Advanced AI searches through legislation data
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="font-bold">3</span>
              </div>
              <h3 className="font-medium mb-1">Analysis</h3>
              <p className="text-xs text-muted-foreground">
                Intelligent analysis and summarization
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="font-bold">4</span>
              </div>
              <h3 className="font-medium mb-1">Results</h3>
              <p className="text-xs text-muted-foreground">
                Comprehensive answers with source citations
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technology Stack */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6">Built With</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {technologies.map((tech, index) => (
                <div key={index} className="text-center">
                  <div className="text-sm font-medium mb-1">{tech.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {tech.description}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Sources */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Bill Bot aggregates data from official U.S. Government sources to ensure 
              accuracy and reliability:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div>
                  <strong>Congress.gov RSS Feeds</strong> - Real-time updates on 
                  introduced bills, amendments, and legislative actions
                </div>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div>
                  <strong>Legislative Data APIs</strong> - Comprehensive bill text, 
                  sponsor information, and voting records
                </div>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div>
                  <strong>Committee Data</strong> - Committee assignments, hearings, 
                  and markup activities
                </div>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Terms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              We respect your privacy. Bill Bot operates with minimal data collection:
            </p>
            <ul className="text-sm space-y-1">
              <li>• No user accounts required</li>
              <li>• No conversation history stored</li>
              <li>• No personal data collection</li>
              <li>• Stateless chat sessions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Open Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Bill Bot is open source and available for community contributions:
            </p>
            <Button variant="outline" asChild className="w-full">
              <a 
                href="https://github.com/your-username/bill-bot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Github className="h-4 w-4" />
                View on GitHub
                <ExternalLink className="h-3 w-3 ml-auto" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="text-center">
        <Separator className="mb-6" />
        <p className="text-sm text-muted-foreground">
          Built with ❤️ for democracy and transparency in government.
        </p>
      </div>
    </div>
  );
}

export default AboutPage;