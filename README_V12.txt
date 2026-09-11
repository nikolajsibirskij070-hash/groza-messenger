ГРОЗА Messenger v12

Исправление SQL-ошибки 42P10.

Для Supabase SQL Editor запускайте файл:
supabase/v12_group_creator_contacts.sql

Важное исправление: блок определения created_by для старых групп переписан без LATERAL, поэтому ошибка:
invalid reference to FROM-clause entry for table "c"
устранена.

Остальные функции v11 сохранены.
