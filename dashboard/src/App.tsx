import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Cpu, 
  History, 
  ExternalLink, 
  Zap,
  Terminal,
  Search,
  MessageSquare,
  Globe
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = 'http://localhost:19456';

interface Status {
  status: string;
  provider: string;
  model: string;
  projectName: string;
  version: string;
}

interface MCP {
  name: string;
  tools: number;
}

interface Plugin {
  name: string;
  description: string;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [memory, setMemory] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [mcp, setMcp] = useState<MCP[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [s, h, m, mc, p] = await Promise.all([
          axios.get(`${API_BASE}/status`),
          axios.get(`${API_BASE}/history`),
          axios.get(`${API_BASE}/memory`),
          axios.get(`${API_BASE}/mcp`),
          axios.get(`${API_BASE}/plugins`)
        ]);
        setStatus(s.data);
        setHistory(h.data);
        setMemory(m.data.content);
        setMcp(mc.data);
        setPlugins(p.data);
      } catch (err) {
        console.error('Fetch failed', err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const chartData = history.slice(-10).map((h, i) => ({
    name: `T-${10-i}`,
    tokens: h.usage?.totalTokens || 0,
  }));

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Zap className="text-white fill-white" size={20} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Lulu Command Center</h1>
            </div>
            <p className="text-slate-400 mt-1 ml-13 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {status?.projectName} <span className="text-slate-600">|</span> {status?.version}
            </p>
          </div>
          
          <nav className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700">
            {['overview', 'memory', 'ecosystem', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard icon={<Database className="text-cyan-400" />} label="Project Memory" value="Active" subValue={status?.projectName} />
                <StatCard icon={<Cpu className="text-purple-400" />} label="Ecosystem" value={`${mcp.length} MCP Servers`} subValue={`${plugins.length} Plugins`} />
                <StatCard icon={<Activity className="text-green-400" />} label="Provider" value={status?.provider || '...'} subValue={status?.model} />
                <StatCard icon={<History className="text-orange-400" />} label="Sessions" value={history.length} subValue="Total Interactions" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart Area */}
                <div className="lg:col-span-2 glass rounded-3xl p-6 border border-slate-700/50">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Zap size={18} className="text-yellow-400" /> Token Usage Over Time
                  </h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                          itemStyle={{ color: '#22d3ee' }}
                        />
                        <Area type="monotone" dataKey="tokens" stroke="#22d3ee" fillOpacity={1} fill="url(#colorTokens)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* System Terminal View */}
                <div className="glass rounded-3xl p-6 border border-slate-700/50">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Terminal size={18} className="text-cyan-400" /> Loaded Servers
                  </h3>
                  <div className="space-y-4">
                    {mcp.map(s => (
                      <div key={s.name} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="text-sm font-semibold">{s.name}</span>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-1 rounded-md">{s.tools} Tools</span>
                      </div>
                    ))}
                    {mcp.length === 0 && <p className="text-slate-500 text-sm italic">No MCP servers online.</p>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'memory' && (
            <motion.div 
              key="memory"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass rounded-3xl p-8 min-h-[600px]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Search className="text-cyan-400" /> Project Knowledge Base
                </h2>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
                {memory || 'Project memory is currently empty. Lulu will populate this as you work.'}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold flex items-center gap-3 mb-4">
                <MessageSquare className="text-purple-400" /> Interactive Session History
              </h2>
              <div className="grid gap-6">
                {history.slice().reverse().map((h, i) => (
                  <div key={i} className="glass rounded-2xl p-6 border border-slate-700/30 hover:border-slate-500 transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h.timestamp || 'Session Log'}</span>
                      <div className="flex gap-2">
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded">{h.usage?.totalTokens || 0} tokens</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-400 font-bold">U</div>
                        <p className="text-sm text-slate-200 mt-1">{h.userMessage || h.prompt}</p>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0 text-cyan-400 font-bold">L</div>
                        <div className="text-sm text-slate-400 mt-1 leading-relaxed">{h.finalText || '...'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'ecosystem' && (
            <motion.div 
              key="ecosystem"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="glass rounded-3xl p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-cyan-400">
                  <Database size={20} /> Model Context Protocol (MCP)
                </h2>
                <div className="space-y-4">
                  {mcp.map(s => (
                    <div key={s.name} className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 hover:border-cyan-500/50 transition-all">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-100">{s.name}</span>
                        <ExternalLink size={14} className="text-slate-500" />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Active server providing {s.tools} atomic tools.</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass rounded-3xl p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-pink-400">
                  <Globe size={20} /> Custom Plugins
                </h2>
                <div className="space-y-4">
                  {plugins.map(p => (
                    <div key={p.name} className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 hover:border-pink-500/50 transition-all">
                      <div className="font-bold text-slate-100">{p.name}</div>
                      <p className="text-xs text-slate-400 mt-2">{p.description}</p>
                    </div>
                  ))}
                  {plugins.length === 0 && <p className="text-slate-500 text-sm italic">No custom plugins detected.</p>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: string | number, subValue?: string }> = ({ icon, label, value, subValue }) => (
  <div className="glass p-6 rounded-3xl border border-slate-700/50 card-hover">
    <div className="flex items-center gap-4 mb-4">
      <div className="p-2 bg-slate-800 rounded-xl">{icon}</div>
      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    {subValue && <div className="text-xs text-slate-500 truncate">{subValue}</div>}
  </div>
);

export default App;
