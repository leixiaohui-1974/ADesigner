import React, { useState, useRef } from 'react';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';
import { Attachment } from '../types';
import { processAttachments } from '../utils/fileUtils';

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessingFile(true);
      const newAttachments = await processAttachments(e.target.files);
      setAttachments(prev => [...prev, ...newAttachments]);
      setIsProcessingFile(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || disabled || isProcessingFile) return;
    onSend(text, attachments);
    setText('');
    setAttachments([]);
  };

  return (
    <div className="p-3 bg-slate-900 border-t border-slate-800">
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto">
          {attachments.map((att, index) => (
            <div key={index} className="relative group shrink-0">
              <div className="w-10 h-10 rounded border border-slate-700 overflow-hidden flex items-center justify-center bg-slate-800">
                {att.mimeType.startsWith('image/') ? (
                  <img src={`data:${att.mimeType};base64,${att.data}`} alt="prev" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-[10px] text-slate-400">文件</div>
                )}
              </div>
              <button onClick={() => removeAttachment(index)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700 focus-within:border-blue-500/50 transition-colors">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 rounded-md transition-colors"
          title="上传附件"
        >
          {isProcessingFile ? <Loader2 className="animate-spin" size={16} /> : <Paperclip size={16} />}
        </button>
        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,application/pdf,text/*" />

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="向 AI 专家咨询故障详情或优化建议..."
          disabled={disabled}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-200 placeholder-slate-500 min-w-0"
          autoComplete="off"
        />

        <button
          onClick={handleSend}
          disabled={(!text.trim() && attachments.length === 0) || disabled}
          className={`p-1.5 rounded-md transition-all ${
            (!text.trim() && attachments.length === 0) || disabled
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-blue-400 hover:bg-blue-900/30'
          }`}
          title="发送"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;