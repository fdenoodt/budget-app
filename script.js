const url = "http://127.0.0.1:5000"
// const url = "https://ofabian.pythonanywhere.com"
const key = authenticate()

const inp_price = document.getElementById('inp_price');
const inp_ratio = document.getElementById('inp_ratio');
const lbl_percent = document.getElementById('lbl_percent');
const inp_price_me = document.getElementById('inp_price_me');
const inp_price_other = document.getElementById('inp_price_other');
const lbl_name = document.getElementById('lbl_name');
const btn_submit = document.getElementById('btn_submit');

let EXPENSES_ALL = null;


const FABIAN = 'Fabian';
const ELISA = 'Elisa';

const data = {
    price: 0, ratio: 100, category: '', description: '',
}

// *** authentication ***
function getKey() {
    return localStorage.getItem("budget_key")
}

function setKey(key) {
    localStorage.setItem('budget_key', key)
}

function authenticate(isForceAuthenticate = false) {
    let key = getKey()
    if (!key || isForceAuthenticate) {
        key = prompt("Password")
        setKey(key)
    }
    return key
}

function handleError(err) {
    const errMessage = err.toString()
    if (errMessage.includes("Unauthorized Access")) {
        // probably unauthorized access
        authenticate(true)
        location.reload()
    } else {
        console.error(err)
    }
}

function betterFetch(url, options = {}) {
    options.headers = {'Authorization': 'Basic ' + btoa(getKey())}
    return fetch(url, options)
}

//// caching
// ---------- Caching utilities ----------
const CACHE_PREFIX = 'cache:ofabian:'; // easy to recognise in localStorage
const DEFAULT_TTL = 1000 * 60 * 10; // 10 minutes

function cacheKey(url) {
    // Make keys safe & shortish (encode URI)
    return CACHE_PREFIX + encodeURIComponent(url);
}

function setCache(url, value) {
    try {
        const obj = {t: Date.now(), v: value};
        localStorage.setItem(cacheKey(url), JSON.stringify(obj));
    } catch (e) {
        // localStorage quota might fail; ignore cache if that happens
        alert('Warning: Unable to set cache, probably localStorage quota exceeded. Consider clearing browser cache or increasing storage quota.');
        console.warn('setCache failed', e);
    }
}

function getCache(url) {
    try {
        const raw = localStorage.getItem(cacheKey(url));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj;
    } catch (e) {
        return null;
    }
}

function clearCacheForUrl(url) {
    localStorage.removeItem(cacheKey(url));
}

function clearCachePrefix(prefixUrlFragment) {
    // remove all cached keys that include the encoded prefixUrlFragment (useful after mutations)
    const encodedFragment = encodeURIComponent(prefixUrlFragment);
    const keys = Object.keys(localStorage);
    for (const k of keys) {
        if (k.startsWith(CACHE_PREFIX) && k.includes(encodedFragment)) {
            localStorage.removeItem(k);
        }
    }
}


async function cachedGetJson(fullUrl, {ttl = DEFAULT_TTL, staleWhileRevalidate = true, force = false} = {}) {
    // Only use cache for GET (we expect caller to use this for GETs)
    const cached = getCache(fullUrl);
    if (!force && cached && (Date.now() - cached.t) < ttl) {
        // fresh cache: return it and optionally revalidate in background
        if (staleWhileRevalidate) {
            // fire a background revalidation but don't block the UI on it
            betterFetch(fullUrl)
                .then(r => r.json())
                .then(fresh => {
                    // if fresh differs, update cache and (optionally) trigger UI refresh
                    try {
                        setCache(fullUrl, fresh);
                        // Optionally dispatch an event to let caller update UI if needed:
                        window.dispatchEvent(new CustomEvent('cache:updated', {detail: {url: fullUrl, data: fresh}}));
                    } catch (e) { /* ignore */
                    }
                })
                .catch(() => { /* keep stale if network fails */
                });
        }
        return cached.v;
    }

    // if we reach here: no cache or stale or force -> fetch from network
    try {
        const resp = await betterFetch(fullUrl);
        const json = await resp.json();
        setCache(fullUrl, json);
        return json;
    } catch (e) {
        // network failed — fall back to cache if available (stale ok)
        if (cached && cached.v) {
            console.warn('Network failed, returning stale cache for', fullUrl);
            return cached.v;
        }
        // no cache, rethrow
        throw e;
    }
}

// ---------- Cache status badge helpers ----------
function createCacheBadgeIfNeeded() {
    if (document.getElementById('cache-badge')) return;
    const style = document.createElement('style');
    style.innerHTML = `
        #cache-badge{position:fixed;right:12px;bottom:12px;z-index:12000;padding:6px 10px;border-radius:999px;font-family:Roboto,Arial,sans-serif;font-size:0.85rem;box-shadow:0 2px 6px rgba(0,0,0,0.12);color:#fff;display:flex;align-items:center;gap:8px}
        #cache-badge .dot{width:10px;height:10px;border-radius:50%;}
        #cache-badge.live{background:#2ecc71}
        #cache-badge.stale{background:#f39c12}
        #cache-badge.loading{background:#3498db}
        #cache-badge.offline{background:#95a5a6}
    `;
    document.head.appendChild(style);

    const badge = document.createElement('div');
    badge.id = 'cache-badge';
    badge.className = 'loading';
    badge.innerHTML = `<span class="dot"></span><span id="cache-badge-text">Loading…</span>`;
    document.body.appendChild(badge);
}

function setCacheBadge(text, variant = 'loading') {
    createCacheBadgeIfNeeded();
    const badge = document.getElementById('cache-badge');
    badge.className = ''; // reset classes
    badge.classList.add(variant);
    const dot = badge.querySelector('.dot');
    if (variant === 'live') {
        dot.style.background = '#00b300';
        setTimeout(() => { // auto-hide after 3s
            badge.style.display = 'none';
        }, 3000);
    } else if (variant === 'stale')
        dot.style.background = 'rgba(255, 205, 86, 0.5)';
    else if (variant === 'loading')
        dot.style.background = 'rgba(0, 122, 251, 0.5)';
    else
        dot.style.background = 'rgba(255, 99, 132, 0.5)';
    document.getElementById('cache-badge-text').textContent = text;
}


//// end caching

/// loading overlay
// ---------- Loading overlay helpers ----------
function createLoadingOverlayIfNeeded() {
    if (document.getElementById('loading-overlay')) return;

    const style = document.createElement('style');
    style.innerHTML = `
#loading-overlay{position:fixed;left:0;top:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;flex-direction:column;z-index:10000;background:rgba(255,255,255,0.7);backdrop-filter: blur(2px);pointer-events:auto;}
#loading-overlay .spinner{width:48px;height:48px;border:6px solid rgba(0,0,0,0.08);border-top-color:rgba(0,0,0,0.5);border-radius:50%;animation:spin 0.9s linear infinite;margin-bottom:10px;}
#loading-overlay #loading-text{font-family:Roboto, sans-serif;font-size:0.95rem;color:#333;}
@keyframes spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner" aria-hidden="true"></div><div id="loading-text">Updating…</div>`;
    document.body.appendChild(overlay);
}

function showLoading(text = 'Updating…') {
    createLoadingOverlayIfNeeded();
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        document.getElementById('loading-text').textContent = text;
        overlay.style.display = 'flex';
        // block pointer events on page
        document.body.style.pointerEvents = 'none';
        // but allow interaction with overlay itself
        overlay.style.pointerEvents = 'auto';
    }
    // disable submit button to avoid duplicate submissions
    if (typeof btn_submit !== 'undefined' && btn_submit) btn_submit.disabled = true;
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.pointerEvents = '';
    if (typeof btn_submit !== 'undefined' && btn_submit) btn_submit.disabled = false;
}

/// end loading overlay

const getName = () => {
    return localStorage.getItem('budget_name') || FABIAN;
}

const readName = () => {
    const lbl_name = document.getElementById('lbl_name');
    lbl_name.innerHTML = getName();
}

const update = () => {
    // round to 2 decimals
    inp_price_me.value = (inp_price.value * (inp_ratio.value / 100)).toFixed(2);
    inp_price_other.value = (inp_price.value * ((100 - inp_ratio.value) / 100)).toFixed(2);

    data.price = inp_price.value;
    data.ratio = inp_ratio.value;
}


const getMonthFromUrlParam = () => { // returns 0, -1, ... indicating how many months ago
    const urlParams = new URLSearchParams(window.location.search);
    const month = parseInt(urlParams.get('month'));
    return isNaN(month) ? 0 : month;
}

const fillDescriptions = (descriptions) => {
    const descriptionshtml = document.getElementById('descriptions')
    for (let i = 0; i < descriptions.length; i++) {
        const option = document.createElement('option')
        option.value = descriptions[i]
        descriptionshtml.appendChild(option)
    }
}


const computeMoneyPig = (monthlySaved) => {
    // list of how much saved at month 0, 1, 2, 3, ... (last element is current month)
    // monthlySaved[i] = {actual: number, target: number, target_only_pig, target_only_investments, actual_only_pig, actual_only_investments}
    // remove the current month as this is still prone to change!!
    monthlySaved = monthlySaved.slice(0, monthlySaved.length - 1) // remove the last element

    const moneyPigAllTime = monthlySaved.reduce((sum, month) => sum + month.actual_only_pig, 0)

    return [moneyPigAllTime, undefined]
}

// ---------- Render data (shared) ----------
function renderData(data) {
    // deep copy of data
    data = JSON.parse(JSON.stringify(data));

    const fabian = data.fabian;
    const elisa = data.elisa;

    const expenses = data.expenses;
    const monthlyExpenses = data.monthly_expenses;

    const monthlySaved = getName() === FABIAN ? data.savings_of_lifetime_fabian : data.savings_of_lifetime_elisa;
    const monthlyEarned = getName() === FABIAN ? data.earnings_of_lifetime_fabian : data.earnings_of_lifetime_elisa;

    // append monthlyExpenses to expenses
    monthlyExpenses.forEach(expense => {
        expenses.push(expense);
        expense.id = -1; // mark as monthly expense
    });

    // merge grouped expenses (existing code)
    const groupedExenses = data.grouped_expenses;
    const groupedMonthlyExenses = data.monthly_grouped_expenses;

    groupedExenses.forEach(expense => {
        const category = expense.category;
        const monthlyExpense = groupedMonthlyExenses.find(e => e.category === category);
        if (monthlyExpense) {
            expense.price_fabian += monthlyExpense.price_fabian;
            expense.price_elisa += monthlyExpense.price_elisa;
        }
    });
    groupedMonthlyExenses.forEach(expense => {
        const category = expense.category;
        const monthlyExpense = groupedExenses.find(e => e.category === category);
        if (!monthlyExpense) {
            groupedExenses.push(expense);
        }
    });

    const historicDescriptions = data.historic_descriptions;
    fillDescriptions(historicDescriptions);

    updateDebts(fabian, elisa);
    updateExpensesAll(expenses);

    if (monthlySaved.length === 0) {
        alert("It's probably the beginning of the month and you haven't included data yet. please do that first before looking at the statistics");
    }

    updateDonut(groupedExenses, computeMoneyPig(monthlySaved)[0],
        monthlySaved[monthlySaved.length - 1].target_only_pig,
        monthlySaved[monthlySaved.length - 1].target_only_investments);
    updateAmsterdamStatistics(data.amsterdam_grouped_expenses);
    updateBar(groupedExenses, expenses);
    updateBarExpensesLastNDays(data.expenses_last_n_days);

    new LineGraphs().display(monthlySaved, monthlyEarned, getMonthFromUrlParam()); // displays monthly saved and monthly earned graphs

    ALL_EXPENSES = expenses;
}

const updateDebtsAndExpensesAll = (maxTrials = 3) => {
    const nbMonthsAgo = getMonthFromUrlParam();
    const cacheTTL = 1000 * 60 * 10; // not used to block rendering; only for badge decision if you want
    const fullUrl = `${url}?month=${nbMonthsAgo}`;

    // 1) show cached immediately if available
    const cached = getCache(fullUrl);
    if (cached && cached.v) {
        // render cached version straight away
        renderData(cached.v);
        // show cached badge with age
        const ageMs = Date.now() - cached.t;
        const ageMin = Math.round(ageMs / 60000);
        setCacheBadge(`Cached • ${ageMin}m old`, 'stale');
    } else {
        // no cache: indicate we're loading
        setCacheBadge('Loading…', 'loading');
    }

    // 2) Always attempt to fetch fresh data in background and update UI when ready
    return betterFetch(fullUrl)
        .then(resp => resp.json())
        .then(fresh => {
            setCache(fullUrl, fresh);
            // update UI if fresh differs from what is currently shown (or always update)
            const cachedJson = cached && cached.v ? JSON.stringify(cached.v) : null;
            const freshJson = JSON.stringify(fresh);
            const shouldUpdateUI = (cachedJson !== freshJson);

            if (shouldUpdateUI) {
                renderData(fresh); // this results in a crash
            }
            setCacheBadge('Live', 'live');
            // dispatch same event as before
            window.dispatchEvent(new CustomEvent('data:loaded', {detail: {url: fullUrl, data: fresh}}));
            return fresh;
        })
        .catch(e => {
            // network failed; if we had cached data we already displayed it — now show offline badge
            if (cached && cached.v) {
                const ageMin = Math.round((Date.now() - cached.t) / 60000);
                setCacheBadge(`Offline — showing cached ${ageMin}m`, 'offline');
            } else {
                setCacheBadge('Offline', 'offline');
            }

            // retry logic for 'Failed to fetch' kept as before
            if (e instanceof TypeError && e.message === 'Failed to fetch') {
                if (maxTrials > 0) {
                    return updateDebtsAndExpensesAll(maxTrials - 1);
                } else {
                    handleError(e);
                    throw e;
                }
            } else {
                handleError(e);
                throw e;
            }
        });
}


class LineGraphs {
    static instanceDict = {};

    _formatNumber(num) { // eg 2.0k -> 2k, but 2.5k -> 2.5k
        const numm = num.toFixed(1);
        return numm % 1 === 0 ? num.toFixed(0) : numm;
    }

    _printMonthlySavedValues(data_more_than_12months) {
        // *** MONEY PIG ***
        const [moneyPig, _] = computeMoneyPig(data_more_than_12months);

        const newDiv = document.createElement('div');
        newDiv.style.fontSize = '0.8em';
        newDiv.innerHTML = `
        Momenteel bevat je spaarvarken <span id="money_pig" style="color: #4BC0C0;">€${moneyPig.toFixed(0)}</span>. Geniet ervan!
        <br>
        (Berekend op basis van de volledige geschiedenis. De huidige maand is nog niet inbegrepen.)`;

        // Append the new div after the div with id 'savings_per_month_in_money_pig'
        const savingsPerMonthDiv = document.getElementById('savings_per_month_in_money_pig');
        savingsPerMonthDiv.parentNode.insertBefore(newDiv, savingsPerMonthDiv.nextSibling);

        // *** INVESTMENTS ***
        const data_last_12months = data_more_than_12months.slice(Math.max(0, data_more_than_12months.length - 12));
        const totalInvestments = data_last_12months.reduce((sum, month) => sum + month.actual_only_investments, 0);
        const avgInvestments = totalInvestments / data_last_12months.length;

        const newDivInvestments = document.createElement('div');
        newDivInvestments.style.fontSize = '0.8em';
        newDivInvestments.innerHTML = `
        In the last 12 months, you invested a total of <span id="investments" style="color: #4BC0C0;">€${totalInvestments.toFixed(0)}</span> (avg: €${avgInvestments.toFixed(0)}).
        <br>
        (Only the last 12 months are considered. Current month is included).
        `;
        const investmentsDiv = document.getElementById('savingsChartInvestments');
        investmentsDiv.parentNode.insertBefore(newDivInvestments, investmentsDiv.nextSibling);
    }


    _printMonthlyEarnedValues(monthlyEarned) {
        const avg = monthlyEarned.reduce((a, b) => a + b, 0) / monthlyEarned.length;
        const total = monthlyEarned.reduce((a, b) => a + b, 0) / 1000; // divide by 1000 to get kEUR

        document.querySelector('#earnings_avg').textContent = avg.toFixed(0)
        document.querySelector('#earnings_total').textContent = `${this._formatNumber(total)}k`;
    }

    drawChart(chartId, height, ...dataArgs) {
        const labels = dataArgs.pop(); // The last argument is always the labels array
        const colors = ['rgb(75, 192, 192)', 'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)',
            'rgb(153, 102, 255)', 'rgb(255, 159, 64)', 'rgb(255, 99, 132)']
        const datasets = dataArgs.map((dataObj, index) => {
            if (dataObj.pointValues) {
                console.assert(dataObj.pointValues.length === dataObj.data.length, "pointValues must be the same length as data");
            }
            return {
                label: dataObj.name || `Dataset ${index + 1}`,
                data: dataObj.data,
                fill: false,
                backgroundColor: colors[index],
                borderColor: colors[index],
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 15,
                borderDash: index === 0 ? [] : [5, 5], // Dashed line for all datasets except the first one
                hidden: index !== 0, // Hide all datasets except the first one
                pointLabels: dataObj.pointValues || [] // Add pointValues as pointLabels
            };
        });

        // Get the canvas context
        const ctx = document.getElementById(chartId).getContext('2d');
        if (LineGraphs.instanceDict[chartId]) {
            LineGraphs.instanceDict[chartId].destroy(); // Destroy previous instance if it exists
        }

        ctx.canvas.height = height; // Set the desired height

        // Create the chart
        const visibleMax = Math.round(
            (Math.max(...dataArgs.flatMap(dataObj => dataObj.data)) * 1.1) / 100
        ) * 100;

        LineGraphs.instanceDict[chartId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        max: visibleMax,
                        ticks: {
                            stepSize: 100
                        }
                    },
                    x: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: 5,
                            font: {
                                size: 8
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const dataset = context.dataset;
                                const index = context.dataIndex;
                                const pointLabel = dataset.pointLabels[index];
                                return pointLabel ?
                                    `${context.label}:  €${context.raw.toFixed(0)} (Total 🐖:  €${pointLabel.toFixed(0)})` // e.g. "Jan: 2800 (3000)"
                                    :
                                    `${context.label}:  €${context.raw.toFixed(0)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    _monthlyEarnedChart(monthlyEarned, labels) {
        // monthlyEarned = [2800, 3000, 3200, ...]
        // labels e.g. ["Jan", "Feb", "Mar", ...]
        monthlyEarned = monthlyEarned.slice(Math.max(0, monthlyEarned.length - 12));

        // const data1 = { name: 'Dataset 1', data: [10, 20, 30, 40] };
        // const data2 = { name: 'Dataset 2', data: [15, 25, 35, 45] };
        // const labels = ['January', 'February', 'March', 'April'];
        //
        // drawChart('myChartId', data1, data2, labels);

        this.drawChart('earningsChart', 200, {'name': 'Earnings', 'data': monthlyEarned}, labels);
        this._printMonthlyEarnedValues(monthlyEarned);
    }

    _getLabels(monthlySaved, nbMonthsAgo) {
        let labels = []; // e.g. ["Jan", "Feb", "Mar", ...]
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentMonth = new Date().getMonth() + nbMonthsAgo % 12; // 0 = Jan, 1 = Feb, ..., 11 = Dec


        for (let i = Math.max(0, monthlySaved.length - 12); i < monthlySaved.length; i++) {
            labels.push(monthNames[(currentMonth - monthlySaved.length + i + 1 + 12) % 12]);
        }

        // only draw the last 12 months so filter to only show the last 12 months
        labels = labels.slice(Math.max(0, labels.length - 12));
        return labels;
    }

    _monthlySavedChart(data_more_than_12months, labels) {
        // money pig graph

        const nbElements = data_more_than_12months.length;
        // Prepare the data (last 12 months or less)
        const data = data_more_than_12months.slice(Math.max(0, nbElements - 12)); // slice the last 12 months
        // data[0..11] are the last 12 months with data[i] = {actual: number, target: number,
        // target_only_pig, target_only_investments,
        // actual_only_pig, actual_only_investments}

        const actual_saved_full = data.map(d => d.actual); // actual saved (money pig + investments)
        const target_saved_full = data.map(d => d.target); // target saved (money pig + investments)

        const actual_saved_pig = data.map(d => d.actual_only_pig); // actual saved (money pig)
        const target_saved_pig = data.map(d => d.target_only_pig); // target saved (money pig)

        const actual_saved_investments = data.map(d => d.actual_only_investments); // actual saved (investments)
        const target_saved_investments = data.map(d => d.target_only_investments); // target saved (investments)


        // const [moneyPig, _] = computeMoneyPig(data_more_than_12months);
        const pointValues = [];
        for (let i = 0; i < Math.min(12, nbElements); i++) {
            const start = Math.max(0, nbElements - 12);
            // take elts 0 ... start + i
            pointValues.push(computeMoneyPig(data_more_than_12months.slice(0, start + i + 1))[0]);
        }

        this.drawChart('savingsChartPig', 200,
            {'name': 'Actual (Pig)', 'data': actual_saved_pig, 'pointValues': pointValues},
            {'name': 'Target (Pig)', 'data': target_saved_pig},
            labels); // labels e.g. ["Jan", "Feb", "Mar", ...]


        this.drawChart('savingsChartInvestments', 120,
            {'name': 'Investments', 'data': actual_saved_investments},
            labels,); // labels e.g. ["Jan", "Feb", "Mar", ...]

        this._printMonthlySavedValues(data_more_than_12months);
    }


    display(monthlySaved, monthlyEarned, nbMonthsAgo) {
        // *** displays monthly saved and monthly earned graphs
        // monthlySaved[0] is the oldest month, monthlySaved[monthlySaved.length - 1] is most recent month
        // nbMonthsAgo e.g. -3 means 3 months ago, -2 means 2 months ago, etc.

        let labels = this._getLabels(monthlySaved, nbMonthsAgo); // e.g. ["Jan", "Feb", "Mar", ...]


        this._monthlySavedChart(monthlySaved, labels);
        this._monthlyEarnedChart(monthlyEarned, labels);
    }

}

const getExpenesPerMainCategory = (expenses, incomeCategory) => {
    // expense: eg [{category: "Groceries", price_fabian: 10, price_elisa: 20}, ... ]

    let expensesBasics = 0;
    let expensesFun = 0;
    let expensesInfreq = 0;

    // exclude Income
    const incomeSum = getName() === FABIAN ? expenses.filter(expense => expense.category === incomeCategory).reduce((a, b) => {
        return a + b.price_fabian
    }, 0) : expenses.filter(expense => expense.category === incomeCategory).reduce((a, b) => {
        return a + b.price_elisa
    }, 0);

    expenses = expenses.filter(expense => expense.category != incomeCategory);

    expenses.forEach(expense => {
        const category = expense.category.toLowerCase();
        const priceFabian = expense.price_fabian;
        const priceElisa = expense.price_elisa;

        // lowercase all items in list
        const basics_keys = categories_basics_keys.map(category => category.toLowerCase());
        const fun_keys = categories_fun_keys.map(category => category.toLowerCase());
        const infreq_keys = categories_infreq_keys.map(category => category.toLowerCase());


        // category is in `categories_basics_keys`
        if (basics_keys.includes(category)) {
            // only my price
            expensesBasics += getName() === FABIAN ? priceFabian : priceElisa;
        } else if (fun_keys.includes(category)) {
            expensesFun += getName() === FABIAN ? priceFabian : priceElisa;
        } else if (infreq_keys.includes(category)) {
            expensesInfreq += getName() === FABIAN ? priceFabian : priceElisa;
        } else {
            alert(`Category ${category} not found in categories_basics_keys, categories_fun_keys or categories_infreq_keys`)
            raiseError(`Category ${category} not found in categories_basics_keys, categories_fun_keys or categories_infreq_keys`)
        }
    });

    return [expensesBasics, expensesFun, expensesInfreq, Math.abs(incomeSum)];
}

const stringSubstr = (str, maxLen) => {
    // expense.category.length > 10 ? expense.category.substring(0, 10) + '...' : expense.category
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str
}

const filterZip = (arr1, arr2, predicate) => {
    // keep only elements where predicate is true

    const result1 = [];
    const result2 = [];
    for (let i = 0; i < arr1.length; i++) {
        if (predicate(arr1[i])) {
            result1.push(arr1[i]);
            result2.push(arr2[i]);
        }
    }

    return [result1, result2];
}

let barChartInstance = null;
const updateBar = (groupedExenses, indivualExpenses) => {
    // ***
    // bar chart with categories on y-axis and prices on x-axis
    // ***

    // groupedExenses:
    // eg [{category: "Groceries", price_fabian: 10, price_elisa: 20}, ... ]
    const ctx = document.getElementById('barChart');
    if (barChartInstance) {
        barChartInstance.destroy(); // Destroy the previous chart instance
    }

    const keys = groupedExenses.map(expense => expense.category);

    const maxLen = 10;
    // substring
    let labels = groupedExenses.map(expense => stringSubstr(expense.category, maxLen));
    let prices = groupedExenses.map(expense => getName() === FABIAN ? expense.price_fabian : expense.price_elisa);

    [prices, labels] = filterZip(prices, labels, (price) => price !== 0);

    // make label "Inkomst" last
    const incomeIndex = labels.indexOf("Inkomst");
    if (incomeIndex != -1) {
        labels.push(labels.splice(incomeIndex, 1)[0]);
        prices.push(prices.splice(incomeIndex, 1)[0]);

        // make its value positive divide by 100
        prices[prices.length - 1] = Math.abs(prices[prices.length - 1]) / 100;
    }


    ctx.height = 350;

    const statistics = {
        labels: labels, keys: keys, datasets: [{
            label: '',
            data: prices,
            backgroundColor: ['rgba(255, 99, 132, 0.5)', 'rgba(0, 122, 251, 0.5)', 'rgba(255, 205, 86, 0.5)',],
        }]
    };


    let clicked = new Map();

    const config = {
        type: 'bar', data: statistics, options: {

            responsive: true, maintainAspectRatio: false, indexAxis: 'y',

            plugins: {
                legend: {
                    display: false // hide dataset label
                }, title: {}, labels: {
                    render: 'label+value', fontSize: 14, position: 'border', // outside, border
                    fontColor: '#FFFFFF',
                }, tooltip: {
                    callbacks: {
                        label: function (context) {
                            const price = context.dataset.data[context.dataIndex];
                            const category = context.label;
                            const expenses = indivualExpenses.filter(expense => stringSubstr(expense.category, maxLen) === category); // some category may be displayed as Zelfontwik...

                            // filter div_expenses to only show expenses of this category
                            const lst_expenses = document.getElementById('ul_expenses_all');

                            lst_expenses.innerHTML = '';
                            expenses.forEach(expense => {
                                const id = expense.id;
                                const date = expense.date; // eg: dd-mm
                                const day = date.split('-')[0];
                                const monthNumeric = date.split('-')[1];
                                const priceFabian = expense.price_fabian;
                                const priceElisa = expense.price_elisa;
                                const description = expense.description;

                                const myPrice = getName() === FABIAN ? priceFabian : priceElisa;

                                lst_expenses.innerHTML += ExpenseListItem.html(id, date, day, monthNumeric, category, description, myPrice, priceFabian + priceElisa);
                            });
                            ExpenseListItem.attachEventListeners();

                            return `€${price.toFixed(2)}`;
                        }
                    },
                    // callback after the tooltip has been is closed
                    events: ['click'], // Change tooltip trigger to click instead of hover
                }
            }
        },
    };

    barChartInstance = new Chart(ctx, config);

}
let expensesLastNDaysChartInstance = null;
const updateBarExpensesLastNDays = (expenses) => {
    // e.g. expenses[i] = {
    //     "id": 1930,
    //     "date": "2025-03-04",
    //     "price_fabian": 7.25,
    //     "price_elisa": 7.25,
    //     "paid_by": "elisa",
    //     "category": "Boodschappen",
    //     "subcategory": "",
    //     "description": "Ah"
    // }

    const ctx = document.getElementById('expenses_last_n_days_chart').getContext('2d');
    if (expensesLastNDaysChartInstance) {
        expensesLastNDaysChartInstance.destroy(); // Destroy the previous chart instance
    }
    ctx.canvas.height = 200; // Set the desired height

    // Group expenses by date and category
    const groupedExpenses = {};
    expenses.forEach(expense => {
        const date = expense.date;
        const category = expense.category;
        const price = getName() === FABIAN ? expense.price_fabian : expense.price_elisa;

        if (!groupedExpenses[date]) {
            groupedExpenses[date] = {};
        }
        if (!groupedExpenses[date][category]) {
            groupedExpenses[date][category] = [];
        }
        groupedExpenses[date][category].push(expense);
    });
    // groupedExpenses[date} = {category: [expense1, expense2, ...], ...}

    // add missing dates
    const today = new Date();
    const n = 7; // last n days
    const firstDate = new Date(today - n * 24 * 60 * 60 * 1000);

    // const lastDate = new Date(expenses[0].date);
    const days = Math.floor((today - firstDate) / (1000 * 60 * 60 * 24));
    for (let i = 1; i <= days; i++) {
        const date = new Date(firstDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        // if missing date, add it
        if (!groupedExpenses[dateStr]) {
            groupedExpenses[dateStr] = {};
        }
    }

    // Prepare data for the chart
    const labels = Object.keys(groupedExpenses).sort(); // x-axis
    const categories = [...new Set(expenses.filter(expense => (getName() === FABIAN ? expense.price_fabian : expense.price_elisa) > 0).map(expense => expense.category))];

    const datasets = categories.map(category => {
        return {
            label: category,
            data: labels.map(date => groupedExpenses[date][category]?.reduce((sum, exp) =>
                    // sum + exp.price_fabian,
                    sum + (getName() === FABIAN ? exp.price_fabian : exp.price_elisa),
                0) || 0),
            stack: 'stack1'
        };
    });


    // Create the chart
    expensesLastNDaysChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(date => new Date(date).toLocaleDateString('en-US', {weekday: 'short'})),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 5,
                        font: {
                            size: 8
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const date = labels[context.dataIndex];
                            const category = context.dataset.label;
                            const expenses = groupedExpenses[date][category];
                            const total = expenses.reduce((sum, exp) => sum + (getName() === FABIAN ? exp.price_fabian : exp.price_elisa), 0).toFixed(2);
                            const expenseDetails = expenses
                                .sort((a, b) => (getName() === FABIAN ? b.price_fabian : b.price_elisa) - (getName() === FABIAN ? a.price_fabian : a.price_elisa))
                                .map(exp => `${exp.description}: €${(getName() === FABIAN ? exp.price_fabian : exp.price_elisa).toFixed(2)}`);
                            return [`Total: €${total}`, ...expenseDetails];
                        }
                    },
                    // callback after the tooltip has been is closed
                    events: ['click'], // Change tooltip trigger to click instead of hover
                    bodyFont: {
                        size: 10 // Set the font size of the tooltip
                    }
                }
            },
        }
    });
}

const updateMonthlyBudgetStatistics = (income, cap, rent, invest, target_pig_addition) => {
    const div_budget_statistics = document.getElementById('div_budget_statistics');
    div_budget_statistics.innerHTML = `
        💲<span data-toggle="tooltip" data-placement="top" title="Netto inkomen">${income.toFixed(0)}</span> = 
        🍞<span data-toggle="tooltip" data-placement="top" title="Allowance voor maandelijkse kosten">${cap.toFixed(0)}</span> + 
        🏠<span data-toggle="tooltip" data-placement="top" title="Huur appartement">${rent.toFixed(0)}</span> + 
        💸<span data-toggle="tooltip" data-placement="top" title="Bedrag te investeren. Berekent op inkomsten nadat target allowance en huur al afgetrokken zijn. 
        Hiervan gaat ${Math.round((invest / (invest + target_pig_addition))) * 100}% naar investeren. De overige ${Math.round((1 - (invest / (invest + target_pig_addition))) * 100)}% gaat naar de het varkentje.
        Het investment bedrag is dus berekend op het inkomen en is onafhankelijk van hoeveel allowance je uiteindelijk uitgeeft.">${invest.toFixed(0)}</span> + 
        🐷<span data-toggle="tooltip" data-placement="top" title="Dit exacte bedrag zal volgende maand naar je varkentje gaan wanneer je deze maand precies €800 aan allowance uitgeeft. Besteed je deze maand bv 5 eur meer of minder, dan gaat er €5 meer/minder naar het varkentje."> ${target_pig_addition.toFixed(0)}</span>
    `;

    $('[data-toggle="tooltip"]').tooltip({trigger: 'hover click touchstart'}).on('mouseleave', function () {
        $(this).tooltip('hide');
    });
}

const updateAmsterdamStatistics = (amsterdamGroupedExpenses) => {
    return;
    // amsterdamGroupedExpenses: [
    // {category:Amsterdam - OV, price_fabian: 10, price_elisa: 20},
    // {category:Amsterdam Boodschappen, price_fabian: 10, price_elisa: 20},
    // {category:Amsterdam Housing, price_fabian: 10, price_elisa: 20},
    // ]

    if (getName() === ELISA) {
        const div_amsterdam_statistics = document.getElementById('div_amsterdam_statistics');
        // display none
        div_amsterdam_statistics.style.display = 'none';
        return
    }

    const consumables = amsterdamGroupedExpenses.filter(expense => expense.category.toLowerCase().includes('amsterdam boodschappen') && expense.category.toLowerCase().includes('boodschappen')).reduce((a, b) => a + (getName() === FABIAN ? b.price_fabian : b.price_elisa), 0);
    const public_transport = amsterdamGroupedExpenses.filter(expense => expense.category.toLowerCase().includes('amsterdam - ov')).reduce((a, b) => a + (getName() === FABIAN ? b.price_fabian : b.price_elisa), 0);
    const housing = amsterdamGroupedExpenses.filter(expense => expense.category.toLowerCase().includes('amsterdam housing')).reduce((a, b) => a + (getName() === FABIAN ? b.price_fabian : b.price_elisa), 0);


    const div_amsterdam_statistics = document.getElementById('div_amsterdam_statistics');
    div_amsterdam_statistics.innerHTML = `
        🍞<span data-toggle="tooltip" data-placement="top" title="Consumables">${consumables.toFixed(0)}</span> +
        🚍<span data-toggle="tooltip" data-placement="top" title="Public transport">${public_transport.toFixed(0)}</span> +
        🏠<span data-toggle="tooltip" data-placement="top" title="Housing">${housing.toFixed(0)}</span>
        = ${(consumables + public_transport + housing).toFixed(0)} / 8448.00
    `;

}

const get_max_allowance = () => {
    // max allowance becomes 1000 starting from 2025-11. Before it was 800

    // get year and month from url param
    const urlParams = new URLSearchParams(window.location.search);
    const monthParam = urlParams.get('month'); // e.g. ..., -3, -2, -1, 0
    let targetDate = new Date();
    if (monthParam) {
        const nbMonthsAgo = parseInt(monthParam);
        targetDate.setMonth(targetDate.getMonth() + nbMonthsAgo);
    }
    const targetMonth = targetDate.getMonth() + 1; // Months are zero-based
    const targetYear = targetDate.getFullYear();
    let allowanceMax = 800;
    if (targetYear > 2025 || (targetYear === 2025 && targetMonth >= 11)) {
        allowanceMax = 1000;
    }
    return allowanceMax;
}

const updateDonut = (groupedExenses, moneyPigTotal, toPutAssideMoneyPig, toInvestCurrentMonth) => {
    // groupedExenses:
    // eg [{category: "Groceries", price_fabian: 10, price_elisa: 20}, ... ]
    // moneyPigTotal: total amount in money pig

    const rent = 455;
    const allowanceMax = get_max_allowance(); // e.g. 800 or 1000 depending on date

    // These two values are just for display purposes
    const maxAllowancePercent = 0.5; // 70%
    const maxMoneyPigPercent = 1 - maxAllowancePercent; // 30%


    const rescaleInnerDonut = (expensesBasics, expensesFun, expensesInfreq, leftOver, // leftOver
                               allowanceMax, moneyPigTotal, leftOverAllowance, leftOverPig,
                               // last two args are used (based on outer donut vals) for approx method when allowanceUsed > allowanceMax
                               allowanceUsedDisp, moneyPigUsedDisp) => {

        const total = expensesBasics + expensesFun + expensesInfreq;
        const ratioAllowance = total / allowanceMax; // e.g. 850 / 800 = 1.0625 or 750 / 800 = 0.9375
        // the first 100% needs to be weighted by 70% and the rest by 30%.
        // For each expense, must compute how much of itself it contributes to the 70% (allowance) and 30% (money pig)
        if (ratioAllowance <= 1) { // easy case, just weight by 70% for allowance
            // normalize to 1
            // Equation derived with pen and paper
            const dispLeftOverAllowance = leftOverAllowance
            const dispLeftOverPig = (((total + leftOverAllowance) / maxAllowancePercent) * maxMoneyPigPercent) // so if 50% equal split, and 40 eur left of 800 allowance -> 40 + 400 = 440 such that it is 50% of 800

            // rest can just remain the same
            const [dispBasics, dispFun, dispInfreq] = [expensesBasics, expensesFun, expensesInfreq]
            return [dispBasics, dispFun, dispInfreq, dispLeftOverAllowance, dispLeftOverPig];
        } else { // more than 100% spent; part needs to be weighted by 70% and the rest by 30%
            const overspent = total - allowanceMax; // e.g. 850 - 800 = 50

            // const overspent = total - allowanceMax; // e.g. 850 - 800 = 50
            // no clue how to find a good `leftOver` score analytically, so we do approximate

            // chatgpt generated code
            const err_target = 0.005;
            const X = 1 - allowanceUsedDisp - moneyPigUsedDisp;
            let leftOver = Math.round((X * total) / (1 - X)); // initial estimate

            // refine if needed within tolerance
            while (Math.abs(X - leftOver / (total + leftOver)) > err_target) {
                if (leftOver / (total + leftOver) < X) {
                    leftOver++;
                } else {
                    leftOver--;
                }
            }


            // I gave up so don't rescale here
            return [expensesBasics, expensesFun, expensesInfreq, 0, leftOver]; // leftOverAllowance, leftOverPig
        }
    }

    const rescaleOuterDonut = (allowanceUsed, allowanceRemaining, moneyPigUsed, moneyPigRemaining,
                               allowanceMax, moneyPigTotal) => {
        // for outer donut

        // only rescale if allowanceRemaining < 0
        // if (allowanceRemaining === 0)
        //     return [allowanceUsed, allowanceRemaining, moneyPigUsed, moneyPigRemaining];

        // e.g. allowanceMax = 800, moneyPigTotal = 2000 but if value spent is 700, we want donut to be almost
        // entirely filled. Such that allowanceMax is 70% filled of the donut
        const allowanceUsedPercent = allowanceUsed / allowanceMax * maxAllowancePercent; // * 0.7
        const allowanceRemainingPercent = allowanceRemaining / allowanceMax * maxAllowancePercent;

        const moneyPigUsedPercent = moneyPigUsed / moneyPigTotal * maxMoneyPigPercent; // * 0.3
        const moneyPigRemainingPercent = moneyPigRemaining / moneyPigTotal * maxMoneyPigPercent;

        return [allowanceUsedPercent, allowanceRemainingPercent, moneyPigUsedPercent, moneyPigRemainingPercent];

    }
    const prices = getExpenesPerMainCategory(groupedExenses, incomeCategory = "Inkomst");

    const expensesBasics = prices[0];
    const expensesFun = prices[1];
    const expensesInfreq = prices[2]; //+ 400;
    let income = prices[3];

    income = income < 2500 ? 2500 : income;

    const usedmoney = expensesBasics + expensesFun + expensesInfreq; // e.g. 850
    let allowanceRemaining = allowanceMax - usedmoney; // e.g. 800 - 850 = -50
    let moneyPigRemaining = moneyPigTotal; // e.g. 2000 but will be reduced by -50
    if (allowanceRemaining < 0) {
        moneyPigRemaining += allowanceRemaining; // e.g. 2000 - 50 = 1950
        allowanceRemaining = 0;
    }
    const allowanceUsed = allowanceMax - allowanceRemaining; // e.g. 800 - 0 = 800
    const moneyPigUsed = moneyPigTotal - moneyPigRemaining; // e.g. 2000 - 1950 = 50
    const leftOver = allowanceRemaining + moneyPigRemaining; // e.g. 0 + 1950 = 1950

    // not donut, but the yellow bar
    updateMonthlyBudgetStatistics(income, allowanceMax, rent, toInvestCurrentMonth, toPutAssideMoneyPig)


    const expenseTotal = expensesBasics + expensesFun + expensesInfreq;
    const fillPct = Math.min(expenseTotal / allowanceMax, 1);

    const outerTotalMax = allowanceMax + moneyPigTotal; // 2800 €
    const usedOuter = fillPct * outerTotalMax;

    const [allowanceUsedDisp, allowanceRemainingDisp, moneyPigUsedDisp, moneyPigRemainingDisp]
        = rescaleOuterDonut(
        allowanceUsed, allowanceRemaining, moneyPigUsed, moneyPigRemaining,
        allowanceMax, moneyPigTotal
    );


    const outerData = [allowanceUsedDisp, allowanceRemainingDisp, moneyPigUsedDisp, moneyPigRemainingDisp];


    const outerLabels = [
        `Allowance used (€${allowanceUsed.toFixed(2)})`,
        `Allowance left (€${allowanceRemaining.toFixed(2)})`,
        `Money Pig used (€${moneyPigUsed.toFixed(2)})`,
        `Money Pig left (€${moneyPigRemaining.toFixed(2)})`
    ];
    const outerColors = [
        'rgba(204, 178, 255, 1.0)',       // used allowance
        'rgba(204, 178, 255, 0.4)',       // remaining allowance
        'rgba(164, 223, 223, 1.0)',       // used money pig
        'rgba(164, 223, 223, 0.4)',      // remaining money pig
    ];

    const [expensesBasicsPercent, expensesFunPercent, expensesInfreqPercent, leftOverAllowancePercent, leftOverPigPercent] = rescaleInnerDonut(
        expensesBasics, expensesFun, expensesInfreq, leftOver,
        allowanceMax, moneyPigTotal, allowanceRemaining, moneyPigRemaining, allowanceUsedDisp, moneyPigUsedDisp
    );
    const innerData = [expensesBasicsPercent, expensesFunPercent, expensesInfreqPercent, leftOverAllowancePercent, leftOverPigPercent];

    const innerLabels = [
        `🍎 €${expensesBasics.toFixed(2)}`,
        `🎉 €${expensesFun.toFixed(2)}`,
        `📎 €${expensesInfreq.toFixed(2)}`,
        `🍞 €${(allowanceMax - allowanceRemaining).toFixed(0)} / ${allowanceMax.toFixed(0)}`,
        `🐖 €${moneyPigTotal.toFixed(0) - moneyPigRemaining.toFixed(0)} / ${moneyPigTotal.toFixed(0)}`
    ];

    const innerColors = [
        'rgba(255, 99, 132, 0.5)',
        'rgba(0, 122, 251, 0.5)',
        'rgba(255, 205, 86, 0.5)',
        'rgba(240, 240, 240, 0.5)',
        'rgba(240, 240, 240, 0.5)',
    ];

    // -----------------------------
    // Combine datasets.
    // Adjust radii and cutout values to reduce the gap between circles.
    // Here the outer donut is drawn from 80% to 100% of the chart radius,
    // and the inner donut from 55% to 75%.
    // -----------------------------
    const statistics = {
        datasets: [
            {
                data: outerData,
                backgroundColor: outerColors,
                label: 'Funds',
                labels: outerLabels,
                weight: 0.2, // thinner outer ring
            },
            {
                data: innerData,
                backgroundColor: innerColors,
                label: 'Expenses',
                labels: innerLabels,
            }
        ]
    };
    plotDonut(statistics);
}

let donutChartInstance = null;
const plotDonut = (statistics) => {
    // ctx.canvas.height = 200; // Set the desired height

    const ctx = document.getElementById('donutChart');
    if (donutChartInstance) {
        donutChartInstance.destroy();
    }

    // Center text plugin now reads from the inner donut (dataset index 1)
    const plugin = {
        id: 'my-plugin',
        beforeDraw: (chart, args, options) => {
            // Use the inner dataset (expenses) to sum up the values (except leftover)
            const data = chart.data.datasets[1].data;
            const sum = data.slice(0, data.length - 2).reduce((a, b) => a + b, 0).toFixed(0);
            const width = chart.width, height = chart.height, ctxChart = chart.ctx;
            const legendWidth = chart.legend && chart.legend.width ? chart.legend.width : 0;
            const text = `€${sum}`;
            const textX = Math.round((width - ctxChart.measureText(text).width) / 2) - legendWidth / 2;
            const textY = height / 2;
            const textLength = text.length;
            const fontSize = 1 //textLength > 6 ? 1 : 1.5;
            ctxChart.restore();
            ctxChart.font = fontSize + "em Roboto";
            ctxChart.textBaseline = "middle";
            ctxChart.fillStyle = '#3e3e3e';
            ctxChart.fillText(text, textX, textY);
            ctxChart.save();
        },
    };

    const config = {
        type: 'doughnut',
        data: statistics,
        options: {
            responsive: true,
            plugins: {
                // Custom legend only for the inner donut (dataset index 1)
                legend: {
                    position: 'right',
                    labels: {
                        // Generate labels based on inner dataset (dataset index 1)
                        generateLabels: function (chart) {
                            const ds = chart.data.datasets[1];
                            if (!ds.labels) return [];
                            return ds.labels.map((label, i) => {
                                const meta = chart.getDatasetMeta(1);
                                return {
                                    text: label,
                                    fillStyle: ds.backgroundColor[i],
                                    hidden: meta.data[i].hidden,
                                    index: i,
                                    datasetIndex: 1,
                                    lineWidth: 0,
                                };
                            });
                        }
                    },
                    onClick: function (e, legendItem, legend) {
                        // Toggle visibility for inner donut item
                        const chart = legend.chart;
                        const meta = chart.getDatasetMeta(legendItem.datasetIndex);
                        meta.data[legendItem.index].hidden = !meta.data[legendItem.index].hidden;
                        chart.update();
                    }
                },
                title: {},
                tooltip: {
                    callbacks: {
                        // label: (tooltipItem, data) => {
                        //     // Use inner donut labels if available
                        //     const ds = data.datasets[tooltipItem.datasetIndex];
                        //     const labelText = (ds.labels && ds.labels[tooltipItem.dataIndex]) ? ds.labels[tooltipItem.dataIndex] : '';
                        //     return labelText + ": " + ds.data[tooltipItem.dataIndex];
                        // }
                    }
                },
                // Configuration for the labels plugin if you are using one
                labels: {
                    render: 'label+value',
                    fontSize: 14,
                    position: 'border',
                    fontColor: '#FFFFFF',
                },
            }
        },
        plugins: [plugin]
    };

    donutChartInstance = new Chart(ctx, config);
}


const updateDebts = (fabian, elisa) => {
    // fabian eg: +14.00
    // elisa eg: +12.00
    const toPay = Math.abs((fabian - elisa).toFixed(2));

    const lbl_name_has_debt = document.getElementById('lbl_name_has_debt');
    const lbl_name_no_debt = document.getElementById('lbl_name_no_debt');
    const lbl_debt = document.getElementById('lbl_debt');

    if (elisa > fabian) { // elisa has debt
        lbl_name_has_debt.innerHTML = ELISA;
        lbl_name_no_debt.innerHTML = FABIAN;
        lbl_debt.innerHTML = toPay;
    } else {
        lbl_name_has_debt.innerHTML = FABIAN;
        lbl_name_no_debt.innerHTML = ELISA;
        lbl_debt.innerHTML = toPay;
    }
}


const updateExpensesAll = (expenses) => {
    const lst_expenses = document.getElementById('ul_expenses_all');
    lst_expenses.innerHTML = '';

    expenses.forEach(expense => {
        // const date = expense.date; // eg: dd-mm
        // convert to dd/mm

        if (expense.date === null) expense.date = "00-00"

        const date = expense.date.split('-').reverse().join('/');
        const priceFabian = Math.abs(expense.price_fabian);
        const priceElisa = Math.abs(expense.price_elisa);
        const category = expense.category;
        const id = expense.id;

        // capitalize first letter of description, if not null or ''
        const description = expense.description === null || expense.description === '' ? '' : expense.description.charAt(0).toUpperCase() + expense.description.slice(1);

        const myPrice = getName() === FABIAN ? priceFabian : priceElisa;
        const day = date.split('/')[0];
        const monthNumeric = date.split('/')[1];

        lst_expenses.innerHTML += ExpenseListItem.html(id, date, day, monthNumeric, category, description, myPrice, priceFabian + priceElisa);

    });
    ExpenseListItem.attachEventListeners();

}


const checkSubmit = () => {
    if (inp_price.value != '' && inp_price.value != 0 && data.category != '') {
        btn_submit.disabled = false;
    } else {
        btn_submit.disabled = true;
    }
}

const chooseCategory = (selectTag) => {
    const options = selectTag.options;
    const selectedOption = options[options.selectedIndex];
    const category = selectedOption.value;

    data.category = category;
    checkSubmit();

    // Set background colour of selectTag
    const selectTagId = selectTag.id;

    const selectTags = [document.getElementById('lst_categories_basics'), document.getElementById('lst_categories_fun'), document.getElementById('lst_categories_infreq')];

    const otherSelectTags = selectTags.filter(tag => tag.id != selectTagId)
    const currentSelectTag = document.getElementById(selectTagId);

    currentSelectTag.style.borderColor = '#034286';
    otherSelectTags.forEach(tag => tag.style.borderColor = '#dcdcdc');

    // Set other selectTag back to default
    otherSelectTags.forEach(tag => tag.selectedIndex = 0);


}

const resetCategorySelection = () => {
    const selectTags = [
        document.getElementById('lst_categories_basics'),
        document.getElementById('lst_categories_fun'),
        document.getElementById('lst_categories_infreq')
    ];

    selectTags.forEach(tag => {
        if (!tag) return;
        tag.selectedIndex = 0;
        tag.style.borderColor = '#dcdcdc';
    });

    data.category = '';
    checkSubmit();
}


const submit = () => {
    // send data to server
    const category = data.category;

    let price_me = inp_price_me.value;
    let price_other = inp_price_other.value;
    if (category === 'Inkomst') { // make negative
        price_me = -Math.abs(price_me);
        price_other = -Math.abs(price_other);
    }

    const price_fabian = getName() === FABIAN ? price_me : price_other;
    const price_elisa = getName() === FABIAN ? price_other : price_me;
    const paidBy = getName().toLowerCase();

    const subcategory = null;
    const description = document.getElementById('inp_description').value;

    const fullUrl = `${url}/add_expense?price_fabian=${price_fabian}&price_elisa=${price_elisa}&paid_by=${paidBy}&category=${category}&subcategory=${subcategory}&description=${description}`;

    // Cache when holidays are added so in future the category is by default 'Reizen'
    if (category === 'Reizen') {
        localStorage.setItem('last_category', category);
        // also save the country submitted in the description (if present, so first word in description)
        const country = description.split(' ')[0];
        if (country) {
            localStorage.setItem('last_country', country);
        }
    } else { // reset last_category
        localStorage.setItem('last_category', '');
        localStorage.setItem('last_country', '');
    }

    // betterFetch(fullUrl)
    //     .then(response => response.json())
    //     .then(() => {
    //         clearCachePrefix(`${url}?month=`);
    //         location.reload();
    //     })
    //     .then(data => {
    //         location.reload();
    //     })
    //     .catch(e => handleError(e))

    betterFetch(fullUrl)
        .then(response => response.json())
        .then(() => {
            // show loading overlay while we clear cache and refresh data
            showLoading('Saving...');
            // clear the cached month pages
            clearCachePrefix(`${url}?month=`);
            // fetch fresh data and update UI (returns promise)
            return updateDebtsAndExpensesAll();
        })
        .then(() => {
            // done — hide overlay
            hideLoading();
            // optionally clear the input fields
            inp_price.value = '';
            inp_price_me.value = '';
            inp_price_other.value = '';
            document.getElementById('inp_description').value = '';
            resetCategorySelection();
            holidayImmediatelyFillInCategory();
        })
        .catch(e => {
            hideLoading();
            handleError(e);
        });


}


const holidayImmediatelyFillInCategory = () => {
    // fill in category 'Reizen' and country from last time
    const lastCategory = localStorage.getItem('last_category');
    const lastCountry = localStorage.getItem('last_country');

    if (lastCategory) {
        const lst_categories_basics = document.getElementById('lst_categories_infreq');
        lst_categories_basics.value = lastCategory;
        chooseCategory(lst_categories_basics); // set border color
    }

    if (lastCountry) {
        const inp_description = document.getElementById('inp_description');
        inp_description.value = lastCountry + ' ' + inp_description.value;
    }
}

const editName = () => {
    // toggle between Fabian and Elisa. Store in localStorage
    const lbl_name = document.getElementById('lbl_name');
    if (lbl_name.innerHTML === FABIAN) {
        lbl_name.innerHTML = ELISA;
        localStorage.setItem('budget_name', ELISA);
    } else {
        lbl_name.innerHTML = FABIAN;
        localStorage.setItem('budget_name', FABIAN);
    }

    readName();
    // location.reload();
}


const clearExpensesFilter = () => {
    updateExpensesAll(ALL_EXPENSES);
}

const showOnlyPaidByMe = () => {
    const expenses = ALL_EXPENSES.filter(expense => expense.paid_by === getName().toLowerCase());
    updateExpensesAll(expenses);
}

// for select tags
const fillCategoriesList = () => {
    const lst_categories_basics = document.getElementById('lst_categories_basics');
    const lst_categories_fun = document.getElementById('lst_categories_fun');
    const lst_categories_infreq = document.getElementById('lst_categories_infreq');

    for (let i = 0; i < categories_basics_keys.length; i++) {
        const key = categories_basics_keys[i];
        const name = categories_basics_names[i];
        const option = document.createElement('option');
        option.value = key;
        option.innerHTML = name;
        lst_categories_basics.appendChild(option);

        // add a line break after the 3rd last option (to seperatate amsterdam costs
        // if (i === categories_basics_keys.length - 4) {
        //     lst_categories_basics.appendChild(document.createElement('hr'));
        // }
    }

    for (let i = 0; i < categories_fun_keys.length; i++) {
        const key = categories_fun_keys[i];
        const name = categories_fun_names[i];
        const option = document.createElement('option');
        option.value = key;
        option.innerHTML = name;
        lst_categories_fun.appendChild(option);
    }

    for (let i = 0; i < categories_infreq_keys.length; i++) {
        const key = categories_infreq_keys[i];
        const name = categories_infreq_names[i];
        const option = document.createElement('option');
        option.value = key;
        option.innerHTML = name;
        lst_categories_infreq.appendChild(option);
    }
}


const updateNavigationButtons = () => {
    // page navigation: calls getMonthFromUrlParam() and updates the navigation buttons
    // get current month from url param
    const month = getMonthFromUrlParam();

    const prev = document.getElementById('paginationPrev');
    const curr = document.getElementById('paginationCurr');
    const next = document.getElementById('paginationNext');

    const prevChild = document.getElementById('paginationPrevChild');
    const currChild = document.getElementById('paginationCurrChild');
    const nextChild = document.getElementById('paginationNextChild');


    // update current page buttons
    prevChild.setAttribute('href', `?month=${month - 1}`);
    currChild.innerHTML = month;
    nextChild.setAttribute('href', `?month=${month + 1}`);

    // update disabled buttons
    if (month === 0) {
        next.classList.add('disabled');
    } else {
        next.classList.remove('disabled');
    }

}


inp_price.addEventListener('input', () => {
    update();
    checkSubmit();
});

inp_ratio.addEventListener('input', () => {
    lbl_percent.innerHTML = inp_ratio.value + '%';
    update();
});

inp_price_me.addEventListener('input', () => {
    checkSubmit();

    // change value of inp_price_other accordingly
    inp_price_other.value = (inp_price.value - inp_price_me.value).toFixed(2);

    //update slider
    inp_ratio.value = (inp_price_me.value / inp_price.value * 100).toFixed(0);
    lbl_percent.innerHTML = inp_ratio.value + '%';
});

inp_price_other.addEventListener('input', () => {
    checkSubmit();

    // change value of inp_price_me accordingly
    inp_price_me.value = (inp_price.value - inp_price_other.value).toFixed(2);

    //update slider
    inp_ratio.value = (inp_price_me.value / inp_price.value * 100).toFixed(0);
    lbl_percent.innerHTML = inp_ratio.value + '%';
});


class ExpenseListItem {
    static timerId = null;

    static html(id, date, day, monthNumeric, category, description, myPrice, priceBoth) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = monthNames[parseInt(monthNumeric, 10) - 1]; // Convert numeric month to name
        const colour = category === "Inkomst" ? "green" : "blue";

        return `
        <li class="expenseItem" data-id="${id}" data-date="${date}">
          <span class="leftSpan">
            <span class="expenseItemTop expenseItemDay">${month}</span> <br>
            <span class="expenseItemBot">${day}</span>
          </span>
          <span class="centerSpan">
            <span class="expenseItemTop">${category}</span> <br>
            <span class="expenseItemBot">${description}</span>
          </span>
          <span class="rightSpan">
            ${this.getPriceText(myPrice, priceBoth, colour)}
          </span>
        </li>
        `;
    }

    static attachEventListeners() {
        document.querySelectorAll('.expenseItem').forEach(item => {
            item.addEventListener('touchstart', (event) => {
                const id = item.dataset.id;
                const date = item.dataset.date;
                ExpenseListItem.startTimer(id, date);
            }, {passive: true});

            item.addEventListener('mousedown', (event) => {
                const id = item.dataset.id;
                const date = item.dataset.date;
                ExpenseListItem.startTimer(id, date);
            });

            item.addEventListener('touchend', () => ExpenseListItem.stopTimer(), {passive: true});
            item.addEventListener('mouseup', () => ExpenseListItem.stopTimer());
            item.addEventListener('mouseleave', () => ExpenseListItem.stopTimer());

            item.addEventListener('click', () => {
                const id = item.dataset.id;
                ExpenseListItem.deleteExpensePrompt(id);
            });
        });
    }

    static deleteExpensePrompt(id) {
        setTimeout(() => {
            if (id == -1) {
                alert('Monthly expenses cannot be edited');
                return;
            }
            confirm(`Delete expense with id ${id}?`) ? this.deleteExpense(id) : null;
        }, 10);
    }

    static editExpensePrompt(id, date) {
        if (id == -1) {
            alert('Monthly expenses cannot be edited');
            return;
        }

        const newDate = prompt(`Edit expense with id ${id}?`, date);
        if (!newDate) return;

        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!datePattern.test(newDate)) {
            alert('Invalid date. Please enter a date in the format "dd/mm/yyyy".');
            return;
        }

        const newDateObj = new Date(newDate.split('/').reverse().join('-'));
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() + 1);

        if (newDateObj > currentDate) {
            alert('Invalid date. The expense date cannot be in the future.');
            return;
        }

        this.editExpense(id, newDate);
    }

    static startTimer(itemId, date) {
        ExpenseListItem.timerId = setTimeout(() => this.editExpensePrompt(itemId, date), 2500);
    }

    static stopTimer() {
        clearTimeout(ExpenseListItem.timerId);
    }

    static getPriceText(myPrice, total, color = "blue") {
        if (myPrice === total) {
            return `<span class="expenseItemTop ${color}" style="font-size: 0.9em;">${myPrice.toFixed(2)}</span> <br>
                    <span class="expenseItemBot"></span>`;
        } else if (myPrice === 0) {
            return `&frasl;`;
        }
        return `<span style="font-size: 1.2em; position: relative; top: 10px;">
                    <sup><span class="${color}">${myPrice}</span></sup>&frasl;<sub><span class="expenseTotal">${total.toFixed(2)}</span></sub>
                </span>`;
    }

    static deleteExpense(id) {
        const fullUrl = `${url}/delete_expense?id=${id}`;
        showLoading('Deleting...');
        betterFetch(fullUrl)
            .then(response => response.json())
            .then(() => {
                clearCachePrefix(`${url}?month=`);
                return updateDebtsAndExpensesAll();
            })
            .then(() => {
                hideLoading();
            })
            .catch(e => {
                hideLoading();
                handleError(e);
            });
    }

    static editExpense(id, date) {
        const fullUrl = `${url}/edit_expense?id=${id}&date=${date}`;
        showLoading('Saving changes...');
        betterFetch(fullUrl)
            .then(response => response.json())
            .then(() => {
                clearCachePrefix(`${url}?month=`);
                return updateDebtsAndExpensesAll();
            })
            .then(() => {
                hideLoading();
            })
            .catch(e => {
                hideLoading();
                handleError(e);
            });
    }


}


