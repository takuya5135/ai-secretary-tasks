-- AI秘書タスク管理アプリ データベース初期構築用 SQL --
-- このSQLをSupabaseのSQL Editorに貼り付けて実行してください --

-- 1. profiles テーブルの作成 (ユーザー情報の拡張)
-- auth.users が作成された際に自動的にここにもレコードが作成されるようにします
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email text,
  is_approved boolean DEFAULT false, -- 管理者がこれを true にしないとアプリが使えない
  google_access_token text,
  google_refresh_token text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) の有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- users は自分のプロフィールのみ読み取り・更新可能 (トークン更新等)
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. 新規ユーザー登録時の自動プロフィール作成トリガー
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 3. tasks_metadata テーブルの作成
-- Google Tasksの情報を補完するメタデータ（3プレイス、優先度、緊急度など）を管理します
CREATE TABLE public.tasks_metadata (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  google_task_id text NOT NULL, -- Google TasksのID
  place text CHECK (place IN ('1st', '2nd', '3rd')) DEFAULT '2nd',
  priority integer DEFAULT 2 CHECK (priority >= 1 AND priority <= 4), 
  urgency integer DEFAULT 2 CHECK (urgency >= 1 AND urgency <= 4),
  ai_suggestion_log jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, google_task_id)
);

-- RLS の有効化
ALTER TABLE public.tasks_metadata ENABLE ROW LEVEL SECURITY;

-- 承認されたユーザーのみが自分のタスクメタデータにアクセス可能とする関数
CREATE OR REPLACE FUNCTION public.is_user_approved()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_approved = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 承認されたユーザーのみが自分のデータを CRUD できるポリシー
CREATE POLICY "Approved users can select own tasks metadata"
ON public.tasks_metadata FOR SELECT 
USING (auth.uid() = user_id AND public.is_user_approved());

CREATE POLICY "Approved users can insert own tasks metadata"
ON public.tasks_metadata FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.is_user_approved());

CREATE POLICY "Approved users can update own tasks metadata"
ON public.tasks_metadata FOR UPDATE 
USING (auth.uid() = user_id AND public.is_user_approved());

CREATE POLICY "Approved users can delete own tasks metadata"
ON public.tasks_metadata FOR DELETE 
USING (auth.uid() = user_id AND public.is_user_approved());


-- 更新日時を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_metadata_modtime
BEFORE UPDATE ON public.tasks_metadata
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
