# 次回の再開手順（2026-10-16確認）

## 確認できたこと

- アプリ名：全国医療機関情報検索サイト
- 専用GitHub：sugano-crypto/All-of-Hospital_clinic
- 専用Supabase：leczxapskgixlzykdovz
- 初期実装の保存コミット：ee069e8cea0197a7c8262471936e145a98a37102
- 最新の環境状態：running / connected。追加の許可ホストは0件。環境変数・Secretsの登録は0件。
- 厚生局公式サイトは通信制限で原本取得を検証できていない。
- GitHubの接続は完了している。GitHub設定の変更は不要。
- 画面に表示されたDENBAと今回専用の環境との関係は未確認。既存環境を今回のものと決めつけて変更しない。

## 正しい環境設定の入口

OpenAI公式資料で確認した経路：

Settings（設定） → Codex Cloud → Environments（環境）

今回専用の環境がまだなければ Create environment で新規作成し、
リポジトリは sugano-crypto/All-of-Hospital_clinic だけを選ぶ。
既存のDENBA・イメージワン環境を変更・流用しない。

今回専用の環境の設定で：
1. Allow Codex to access internet を有効化。
2. Package managers を維持し、Additional allowed domains に次を追加。
   - kouseikyoku.mhlw.go.jp
   - www.mhlw.go.jp
   - leczxapskgixlzykdovz.supabase.co
3. 設定を保存し、準備・確認後に Publish / Republish。
4. その環境を選んで新しいタスクを開始する。

公式資料によると、既存タスクは自分の状態を保持する。
再公開した環境の変更は新しいタスクで検証する。
「このチャットを開いて待てば反映される」とは扱わない。

公式資料：
https://developers.openai.com/codex/environments/cloud-environments
https://help.openai.com/en/articles/20001545-using-codex-cloud

## 次のタスクへ渡す依頼文

この専用環境で「全国医療機関情報検索サイト」の開発を再開してください。
対象GitHubは sugano-crypto/All-of-Hospital_clinic、
対象Supabaseは leczxapskgixlzykdovz だけです。
他プロジェクトのコード・データ・環境設定・Secretsは使わず、変更しないでください。

まず README.md、docs/SETUP.md、docs/SOURCES.md、docs/VALIDATION.md と
この docs/NEXT_SESSION.md を読んで現在地を確認してください。

全国8厚生（支）局から医科の病院・診療所一覧と届出全体版の原本を取得し、
全シート・全項目・47都道府県の網羅性を実測してください。
主な項目別資料や直近変更資料だけで全項目取得済みと判定しないでください。
届出は正式名称をDBの official_name に保存し、正式名称で検索します。
略称は局・適用期間・公式出典付きの対応表で照合し、未対応や曖昧なものは推測しないでください。
毎月20日に取得し、取得失敗局だけ25日に再取得します。
現行の監査スクリプトは原本取得・シート読込までで、
全項目の意味的変換や自動DB入替はまだ実装済みではありません。

最小アプリ、検索・CSV/Excel出力・顧問先管理、
DBスキーマ・RLSのローカル検証は完了しています。
本番Supabase接続・実サービス上の認証検証・全国実データ変換・
実際の月次DB更新・ロゴ原本配置・ホスティングは未完了です。
秘密情報はチャットへ貼らせず、安全な環境設定を使ってください。

## ロゴ

会社ロゴは会話上では受領したが、初期実装時の実行環境には
原本ファイルを配置できていない。
画像を再生成したり別ロゴで代替せず、原本を入手して配置する。
現行コードの配置先は public/company-logo.png。
