# Развёртывание на сервере

Приложение: **https://max-chat.2-56-126-240.nip.io/**.
Хостинг — сервер в Варшаве; Nginx отдаёт содержимое `dist/`.
Node.js нужен только на машине сборки. Данные GREEN-API на сервер не копируются.

## Первое размещение

Потребуются SSH-доступ к серверу, установленный Nginx и Certbot.
DNS-имя должно указывать на сервер, порты 80 и 443 — принимать соединения.
В конфигурациях ниже используются конкретные имя хоста и каталог этого проекта;
при переносе на другой сервер замените их.

На машине сборки:

```bash
npm ci
npm test
npm run build
tar -czf max-green-chat-dist.tar.gz -C dist .
scp max-green-chat-dist.tar.gz root@2.56.126.240:/tmp/
scp deploy/nginx.http.conf root@2.56.126.240:/tmp/max-green-chat.http.conf
scp deploy/nginx.conf root@2.56.126.240:/tmp/max-green-chat.https.conf
```

На сервере выберите новое уникальное имя релиза:

```bash
release_name=20261021-1
release_dir=/var/www/max-green-chat/releases/$release_name
mkdir -p "$release_dir"
tar -xzf /tmp/max-green-chat-dist.tar.gz -C "$release_dir"
test -f "$release_dir/index.html"
chmod -R u=rwX,go=rX "$release_dir"
ln -s "$release_dir" /var/www/max-green-chat/current
install -m 644 /tmp/max-green-chat.http.conf /etc/nginx/sites-available/max-green-chat
ln -s /etc/nginx/sites-available/max-green-chat /etc/nginx/sites-enabled/max-green-chat
nginx -t && systemctl reload nginx
```

Выпустите сертификат через существующий аккаунт Certbot:

```bash
certbot certonly --webroot -w /var/www/max-green-chat/current \
  -d max-chat.2-56-126-240.nip.io --non-interactive --keep-until-expiring
install -m 644 /tmp/max-green-chat.https.conf /etc/nginx/sites-available/max-green-chat
nginx -t && systemctl reload nginx
curl -I https://max-chat.2-56-126-240.nip.io/
```

Если Certbot ещё не настроен на сервере, сначала зарегистрируйте его аккаунт
по инструкции вашей системы. Проверьте работу таймера обновления сертификатов
и наличие deploy-hook, который перезагружает Nginx после успешного продления.

## Обновление

Соберите и загрузите новый архив, распакуйте его в **новый** каталог релиза.
Не перезаписывайте файлы активного релиза. Затем переключите символьную ссылку:

```bash
release_dir=/var/www/max-green-chat/releases/НОВОЕ_ИМЯ_РЕЛИЗА
test -f "$release_dir/index.html"
readlink -f /var/www/max-green-chat/current
ln -s "$release_dir" /var/www/max-green-chat/current.next
mv -Tf /var/www/max-green-chat/current.next /var/www/max-green-chat/current
curl -I https://max-chat.2-56-126-240.nip.io/
```

Для обновления статических файлов перезагрузка Nginx не требуется.
Действующие вкладки пользователей сохраняют старую сессию до обновления страницы.

## Откат

Укажите каталог предыдущего релиза и теми же командами переключите ссылку `current`.
Старые релизы сохраняются, поэтому откат не требует повторной сборки.
Изменения конфигурации проверяйте командой `nginx -t` перед reload.

## Проверка после размещения

- HTTP перенаправляет на HTTPS, сертификат проходит проверку браузера.
- Главная страница, favicon и файлы `/assets/` возвращают HTTP 200.
- Открывается форма подключения без ошибок JavaScript и CSP.
- Для проверки реальной переписки используйте собственный инстанс и второй аккаунт MAX.
- Одновременно держите открытым один клиент на инстанс, чтобы не разделять очередь уведомлений.
