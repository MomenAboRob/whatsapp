import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getWhatsAppManager } from '@/lib/whatsapp-client';

function getCrmFile(waDir: string): Record<string, any> {
  try {
    const userPath = path.join(waDir, 'chat_crm.json');
    if (fs.existsSync(userPath)) {
      const raw = fs.readFileSync(userPath, 'utf-8');
      return JSON.parse(raw);
    }
    const rootPath = path.join(process.cwd(), 'whatsapp_auth', 'chat_crm.json');
    if (fs.existsSync(rootPath)) {
      const raw = fs.readFileSync(rootPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading chat_crm.json:', e);
  }
  return {};
}

function saveCrmFile(waDir: string, data: Record<string, any>): void {
  try {
    if (!fs.existsSync(waDir)) {
      fs.mkdirSync(waDir, { recursive: true });
    }
    const userPath = path.join(waDir, 'chat_crm.json');
    fs.writeFileSync(userPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing chat_crm.json:', e);
  }
}

export async function GET(req: NextRequest) {
  const wa = getWhatsAppManager(req);
  const waDir = wa.authDir || path.join(process.cwd(), 'whatsapp_auth');
  const data = getCrmFile(waDir);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const waDir = wa.authDir || path.join(process.cwd(), 'whatsapp_auth');
    const body = await req.json();
    const { chatKey, updates, action } = body;

    if (!chatKey) {
      return NextResponse.json({ success: false, message: 'chatKey is required' }, { status: 400 });
    }

    const allData = getCrmFile(waDir);
    const current = allData[chatKey] || { tags: [], notes: [] };

    if (action === 'set_tags' && Array.isArray(updates.tags)) {
      current.tags = updates.tags;
      current.updatedAt = new Date().toISOString();
    } else if (action === 'add_note' && updates.note) {
      const newNote = {
        id: `note_${Date.now()}`,
        text: updates.note.text,
        author: updates.note.author || 'أنا',
        createdAt: new Date().toISOString(),
      };
      current.notes = [newNote, ...(current.notes || [])];
      current.updatedAt = new Date().toISOString();
    } else if (action === 'delete_note' && updates.noteId) {
      current.notes = (current.notes || []).filter((n: any) => n.id !== updates.noteId);
      current.updatedAt = new Date().toISOString();
    } else if (action === 'update' && typeof updates === 'object') {
      Object.assign(current, updates);
      current.updatedAt = new Date().toISOString();
    }

    allData[chatKey] = current;
    saveCrmFile(waDir, allData);

    return NextResponse.json({ success: true, record: current, data: allData });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
