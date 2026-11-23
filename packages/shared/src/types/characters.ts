export interface CharacterPreset {
  id: string;
  label: string;
  category: 'core' | 'content';
  badgeColor: string;
  defaultTitle: string;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  // 核心研发类
  { id: 'lead', label: '主 Agent', category: 'core', badgeColor: '#3b4252', defaultTitle: 'Team Lead' },
  { id: 'researcher', label: '研究员', category: 'core', badgeColor: '#8f9779', defaultTitle: 'Researcher' },
  { id: 'developer', label: '开发者', category: 'core', badgeColor: '#3b5998', defaultTitle: 'Developer' },
  { id: 'reviewer', label: '审核员', category: 'core', badgeColor: '#8b475d', defaultTitle: 'Reviewer' },
  { id: 'docs', label: '文档专员', category: 'core', badgeColor: '#c68642', defaultTitle: 'Tech Writer' },
  // 内容与运营类
  { id: 'editor', label: '剪辑师', category: 'content', badgeColor: '#f07167', defaultTitle: 'Video Editor' },
  { id: 'ops', label: '运营专员', category: 'content', badgeColor: '#2a9d8f', defaultTitle: 'Operations' },
  { id: 'writer', label: '编剧', category: 'content', badgeColor: '#7f4f5a', defaultTitle: 'Scriptwriter' },
  { id: 'designer', label: '视觉设计师', category: 'content', badgeColor: '#9b72cf', defaultTitle: 'Visual Designer' },
  { id: 'voice', label: '配音师', category: 'content', badgeColor: '#6bbf8e', defaultTitle: 'Voice Actor' },
  { id: 'analyst', label: '数据分析师', category: 'content', badgeColor: '#60a5fa', defaultTitle: 'Data Analyst' },
  { id: 'community', label: '社群专员', category: 'content', badgeColor: '#f4a261', defaultTitle: 'Community Manager' },
  { id: 'pm', label: '项目经理', category: 'content', badgeColor: '#7c8450', defaultTitle: 'Project Manager' },
];

export type CharacterPresetId = (typeof CHARACTER_PRESETS)[number]['id'];
