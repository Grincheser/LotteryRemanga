// Задержка между запросами
const delay = ms => new Promise(res => setTimeout(res, ms));

// Безопасный запрос к API
async function fetchAPI(url) {
    // Список публичных прокси для обхода CORS
    const proxies = [
        target => `https://corsproxy.io/?${encodeURIComponent(target)}`,
        target => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`
    ];

    for (const createProxyUrl of proxies) {
        try {
            const proxyUrl = createProxyUrl(url);
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.warn(`Ошибка прокси: ${e.message}, пробуем следующий...`);
        }
    }

    console.error("Все CORS-прокси недоступны для URL:", url);
    return null;
}

// Парсинг ссылок
function extractSlug(url) {
    if (!url) return null;
    const match = url.match(/forum\/([^\/?#]+)/);
    return match ? match[1] : null;
}

function extractUserId(url) {
    if (!url) return null;
    const match = url.match(/user\/(\d+)/);
    return match ? match[1] : null;
}

// Изменение статуса на экране с поддержкой цвета ошибок
function setStatus(text, isError = false) {
    const el = document.getElementById('status');
    if (el) {
        el.innerText = text;
        el.style.color = isError ? '#ff4d4d' : '#00d166'; // Красный для ошибок, зеленый для статуса
    }
}

// Сбор данных с пагинацией
async function fetchAllPages(baseUrl, dataExtractor) {
    let page = 1;
    let allData = [];
    
    while (true) {
        setStatus(`Загрузка данных... Страница ${page}`);
        let separator = baseUrl.includes('?') ? '&' : '?';
        let url = `${baseUrl}${separator}page=${page}`;
        
        let json = await fetchAPI(url);
        if (!json) break;

        let items = Array.isArray(json) ? json : (json.content || json.results || json.msg);
        if (!items || !Array.isArray(items) || items.length === 0) break;

        const extracted = dataExtractor(items);
        allData = allData.concat(extracted);
        
        if (json.next === null || json.page === json.total_pages) break;
        
        page++;
        await delay(300);
    }
    return allData;
}

// Основная логика розыгрыша
async function startLottery() {
    const postUrl = document.getElementById('postUrl').value.trim();
    const userUrl = document.getElementById('userUrl').value.trim();
    
    const condLike = document.getElementById('condLike').checked;
    const condComment = document.getElementById('condComment').checked;
    const condFollow = document.getElementById('condFollow').checked;
    const multiComments = document.getElementById('multiComments').checked;
    const winnersCount = parseInt(document.getElementById('winnersCount').value) || 1;

    const btn = document.getElementById('startBtn');

    // Сбрасываем правое окно результатов в исходный вид
    document.getElementById('resultsCard').style.display = 'none';
    document.getElementById('placeholderText').style.display = 'block';

    // ВАЛИДАЦИЯ В ИНТЕРФЕЙСЕ (Без alert)
    if (!condLike && !condComment && !condFollow) {
        setStatus("Ошибка: Выберите хотя бы одно условие!", true);
        return;
    }

    if ((condLike || condComment) && !postUrl) {
        setStatus("Ошибка: Укажите ссылку на пост!", true);
        return;
    }

    if (condFollow && !userUrl) {
        setStatus("Ошибка: Укажите ссылку на профиль организатора!", true);
        return;
    }

    btn.disabled = true;

    try {
        let pool = [];

        // 1. Сбор комментариев
        if (condComment) {
            setStatus("Получение системного ID поста...");
            const postSlug = extractSlug(postUrl); 
            
            if (!postSlug) {
                setStatus("Ошибка: Некорректная ссылка на пост!", true);
                btn.disabled = false;
                return;
            }

            const postInfo = await fetchAPI(`https://api.remanga.org/api/v2/forum/${postSlug}/`);
            const realPostId = postInfo ? (postInfo.content?.id || postInfo.msg?.id || postInfo.id) : null;

            if (!realPostId) {
                setStatus("Ошибка: Пост не найден или удален!", true);
                btn.disabled = false;
                return;
            }

            setStatus(`Сбор комментариев (ID: ${realPostId})...`);
            const url = `https://api.remanga.org/api/v2/activity/comments/?post_id=${realPostId}&count=100`;
            
            const comments = await fetchAllPages(url, items => 
                items
                    .filter(i => i && i.user)
                    .map(i => ({ id: String(i.user.id), username: i.user.username || i.user.name }))
            );

            if (multiComments) {
                pool = comments;
            } else {
                const unique = new Map();
                comments.forEach(c => unique.set(c.id, c));
                pool = Array.from(unique.values());
            }
        }

        // 2. Сбор лайков
        if (condLike) {
            setStatus("Сбор лайков...");
            const postSlug = extractSlug(postUrl);
            const url = `https://api.remanga.org/api/v2/forum/${postSlug}/reactions/?count=100&type=0`;
            
            const likesArr = await fetchAllPages(url, items => 
                items
                    .filter(i => i && (i.user || i.id))
                    .map(i => {
                        const u = i.user || i;
                        return { id: String(u.id), username: u.username || u.name || `ID ${u.id}` };
                    })
            );

            const likesMap = new Map();
            likesArr.forEach(l => likesMap.set(l.id, l));

            if (!condComment) {
                pool = Array.from(likesMap.values());
            } else {
                pool = pool.filter(user => likesMap.has(String(user.id)));
            }
        }

        // 3. Сбор подписчиков
        const userId = extractUserId(userUrl);
        if (condFollow) {
            setStatus("Сбор подписчиков...");
            const url = `https://api.remanga.org/api/v2/users/followers/?count=100&id=${userId}&ordering=-id&sub_type=author_users`;
            
            const folArr = await fetchAllPages(url, items => 
                items
                    .filter(i => i)
                    .map(i => {
                        const u = i.user || i;
                        return { id: String(u.id), username: u.username || u.name };
                    })
            );

            const followersMap = new Map();
            folArr.forEach(f => followersMap.set(f.id, f));

            if (!condComment && !condLike) {
                pool = Array.from(followersMap.values());
            } else {
                pool = pool.filter(user => followersMap.has(String(user.id)));
            }
        }

        // Исключаем организатора
        if (userId) {
            pool = pool.filter(user => String(user.id) !== String(userId));
        }

        if (pool.length === 0) {
            setStatus("Нет участников, выполнивших все условия!", true);
            btn.disabled = false;
            return;
        }

        setStatus(`Найдено участников: ${pool.length}. Перемешивание...`);

        // Тасование Фишера-Йетса
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        // Выбор победителей
        let winners = [];
        let usedIds = new Set();

        for (let user of pool) {
            if (!usedIds.has(user.id)) {
                winners.push(user);
                usedIds.add(user.id);
            }
            if (winners.length >= winnersCount) break;
        }

        // Формирование текстового результата без конфликта имен variables
        let winnersOutputText = "";
        winners.forEach((w, index) => {
            winnersOutputText += `${index + 1} место | ${w.username} (${w.id})\n`;
        });

        // Отображение в правой колонке
        document.getElementById('resultText').value = winnersOutputText;
        document.getElementById('placeholderText').style.display = 'none';
        document.getElementById('resultsCard').style.display = 'flex';
        setStatus("Розыгрыш успешно завершен!");

    } catch (error) {
        console.error(error);
        setStatus("Произошла ошибка при обработке данных!", true);
    }

    btn.disabled = false;
}

// Копирование в буфер обмена без alert
function copyResults() {
    const text = document.getElementById('resultText');
    text.select();
    document.execCommand("copy");
    setStatus("Результаты скопированы в буфер!");
}

// Скачивание txt файла
function downloadResults() {
    const text = document.getElementById('resultText').value;
    if (!text) return;
    
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "Результаты_Розыгрыша_Remanga.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Файл результатов сохранен!");
}
