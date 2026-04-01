export interface IHtmlPage {
  pageTitle: string;
  html: string;
}

export interface IPdfFileReference {
  fileId: string;
  fileName: string;
}

export interface IAppraisalSummaryField {
  value: string;
  pageNumber: string;
}

export interface IAppraisalSummaryData {
  [key: string]: IAppraisalSummaryField;
}

export const defaultHtmlPage: IHtmlPage = {
  pageTitle: '',
  html: '',
};

export interface IDialogue {
  delay: number;
  direction: string;
  utterance: string;
}

export interface IAgentPersonaParameters {
  attitude?: string;
  persona?: string;
  response_style?: string;
}

export interface IDiscussionAgentProfile {
  id: string;
  display_name: string;
  voice_name: string;
  voice_api_instructions: string;
  persona_parameters?: IAgentPersonaParameters;
}

export interface IDiscussionTopic {
  id: string;
  title: string;
  summary: string;
}

export interface IProfile {
  profile_file: string;
  profile_title: string;
  profile_id: string;
  isSpeakerOn: boolean;
  aiVolume: number;
  aiFullVolume: number;
  simVolume: number;
  simFullVolume: number;
  model_name: string;

  // Specific to Google
  model_instructions?: string;

  // Specific to Azure
  voice_api_instructions?: string;
  vision_api_instructions?: string;
  project_endpoint?: string;
  agent_name?: string;
  agent_version?: string;

  data_instructions: string;
  data_summary_template: string;
  dialogue_file: string;
  topics_file?: string;
  voice_name: string;
  pdf_upload: boolean;
  pdf_file: string;
  pdf_summary: boolean;
  pdf_flush: boolean;
  image_count: number;
  resource_files: string[];
  pre_recorded: boolean;
  turn_complete: boolean;
  inputs_opening_utterance: string;
  go_bridge: string;
  elevenLabsVoiceId: string;
  clear_session_on_startup: boolean;
  show_chatbots: boolean;
  show_side_panel: boolean;
  auto_start: number;
  default_text_message?: string;
  start_button_mode?: 'record' | 'playback';
  discussion_mode?: 'single' | 'dual-live';
  conversation_starter?: string;
  session_duration_minutes?: number;
  assistants?: IDiscussionAgentProfile[];
}

export const defaultProfile: IProfile = {
  profile_file: '',
  profile_title: '',
  profile_id: '',
  isSpeakerOn: true,
  aiVolume: 0.0,
  aiFullVolume: 0.9,
  simVolume: 0.0,
  simFullVolume: 0.9,
  model_name: '',
  model_instructions: '',
  voice_api_instructions: '',
  vision_api_instructions: '',
  data_instructions: '',
  data_summary_template: '',
  dialogue_file: '',
  topics_file: '',
  voice_name: '',
  pdf_file: '',
  project_endpoint: '',
  agent_name: '',
  agent_version: '',
  pdf_summary: false,
  pdf_upload: false,
  pdf_flush: false,
  image_count: 0,
  resource_files: [],
  pre_recorded: false,
  turn_complete: true,
  inputs_opening_utterance: '',
  go_bridge: '',
  elevenLabsVoiceId: '',
  clear_session_on_startup: false,
  show_chatbots: true,
  show_side_panel: true,
  auto_start: 0,
  default_text_message: '',
  start_button_mode: 'record',
  discussion_mode: 'single',
  conversation_starter: '',
  session_duration_minutes: 5,
  assistants: [],
};

export interface IChatMessage {
  text: string;
  sender: string;
  timestamp: number;
}

export interface IVoiceAssistantConfig {
  voiceApiEndpoint: string;
  voiceApiKey?: string;
  useTokenCredential?: boolean;
  voiceApiVoice: string;
  voiceApiInstructions: string;
  enableInputAudio?: boolean;
}

export interface IVoiceAssistantConfig {
  voiceApiEndpoint: string;
  voiceApiKey?: string;
  useTokenCredential?: boolean;
  voiceApiVoice: string;
  voiceApiInstructions: string;
  enableInputAudio?: boolean;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: 'auto' | 'none' | Record<string, unknown>;
  debugMode?: boolean;
}

export interface IVisionAssistantConfig {
  visionApiEndpoint: string;
  visionApiKey?: string;
  visionApiDeployment: string;
  visionApiInstructions: string;
  debugMode?: boolean;
}

export interface IPdfAssistantConfig {
  pdfApiEndpoint: string;
  pdfApiKey?: string;
  pdfApiModel: string;
  debugMode?: boolean;
}

export interface IFoundryAgentConfig {
  proxyEndpoint: string;
  debugMode?: boolean;
}

export interface IVoiceAssistantCallbacks {
  onConnectionStatusChange: (status: string) => void;
  onAssistantStatusChange: (status: string) => void;
  onConversationMessage: (message: { role: string; content: string; timestamp: Date }) => void;
  onConversationMessageUpdate: (message: {
    role: string;
    content: string;
    timestamp: Date;
    messageId?: string;
    isStreaming?: boolean;
  }) => void;
  onEventReceived: (event: { type: string; data: any; timestamp: Date }) => void;
  onFunctionCall?: (request: {
    name: string;
    arguments: string;
    callId: string;
  }) => Promise<string | Record<string, unknown>>;
  onError: (error: string) => void;
  onAudioLevel: (level: number) => void;
  onOutputAudioLevel?: (level: number) => void;
}

export interface IPropertyAppraisal {
  fileNo: {
    question: 'What is the file number?';
    answer: '';
  };
  clientName: {
    question: 'Who is the client?';
    answer: '';
  };
  state: {
    question: 'What state is the property located in?';
    answer: '';
  };
  county: {
    question: 'What county is the property located in?';
    answer: '';
  };
}

export const defaultPropertyAppraisal: IPropertyAppraisal = {
  fileNo: {
    question: 'What is the file number?',
    answer: '',
  },
  clientName: {
    question: 'Who is the client?',
    answer: '',
  },
  state: {
    question: 'What state is the property located in?',
    answer: '',
  },
  county: {
    question: 'What county is the property located in?',
    answer: '',
  },
};
