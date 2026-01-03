const url = config.url;

const chartInstances = {};
let currentPerson = 'fabian';

function getKey() {
    return localStorage.getItem("budget_key");
}

function setKey(key) {
    localStorage.setItem('budget_key', key);
}

function authenticate(isForceAuthenticate = false) {
    let key = getKey();
    if (!key || isForceAuthenticate) {
        key = prompt("Password");
        setKey(key);
    }
    return key;
}

function handleError(err) {
    const errMessage = err.toString();
    if (errMessage.includes("Unauthorized Access")) {
        authenticate(true);
        location.reload();
    } else {
        console.error(err);
    }
}

function betterFetch(fullUrl, options = {}) {
    options.headers = {'Authorization': 'Basic ' + btoa(getKey())};
    return fetch(fullUrl, options);
}

function getPreferredPerson() {
    const stored = (localStorage.getItem('budget_name') || '').toLowerCase();
    return stored === 'elisa' ? 'elisa' : 'fabian';
}

const formatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
});

const compactFormatter = new Intl.NumberFormat('nl-NL', {
    notation: 'compact',
    maximumFractionDigits: 1
});

function formatCurrency(value) {
    return formatter.format(value);
}

function formatCompact(value) {
    return compactFormatter.format(value);
}

function setStatus(text) {
    const status = document.getElementById('dashboardStatus');
    if (status) status.textContent = text;
}

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function buildChart(id, config) {
    const ctx = document.getElementById(id).getContext('2d');
    destroyChart(id);
    chartInstances[id] = new Chart(ctx, config);
}

function updateKpis(data) {
    const expenses = data.monthly_totals.expenses;
    const income = data.monthly_totals.income;
    const months = data.months;

    const totalSpent = expenses.reduce((sum, val) => sum + val, 0);
    const totalIncome = income.reduce((sum, val) => sum + val, 0);
    const avgSpent = expenses.length ? totalSpent / expenses.length : 0;
    const netTotal = totalIncome - totalSpent;

    const peakValue = Math.max(...expenses);
    const peakIndex = expenses.indexOf(peakValue);
    const peakMonth = months[peakIndex] || "--";

    const topCategory = data.category_totals[0];

    document.getElementById('kpiTotalSpent').textContent = formatCurrency(totalSpent);
    document.getElementById('kpiAvgSpent').textContent = `Avg ${formatCurrency(avgSpent)} / month`;
    document.getElementById('kpiTotalIncome').textContent = formatCurrency(totalIncome);

    const netLabel = document.getElementById('kpiNet');
    netLabel.textContent = `Net ${formatCurrency(netTotal)}`;
    netLabel.style.color = netTotal >= 0 ? '#2a9d8f' : '#d14545';

    document.getElementById('kpiPeakMonth').textContent = peakMonth;
    document.getElementById('kpiPeakValue').textContent = formatCurrency(peakValue);

    if (topCategory) {
        document.getElementById('kpiTopCategory').textContent = topCategory.category;
        document.getElementById('kpiTopCategoryValue').textContent = formatCurrency(topCategory.total);
    } else {
        document.getElementById('kpiTopCategory').textContent = '--';
        document.getElementById('kpiTopCategoryValue').textContent = '--';
    }
}

function renderCharts(data) {
    const months = data.months;
    const colors = ['#0069d9', '#f08a5d', '#6a4c93', '#43aa8b', '#f9c74f', '#577590', '#d62828'];

    buildChart('chartIncomeExpense', {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Expenses',
                    data: data.monthly_totals.expenses,
                    borderColor: '#d62828',
                    backgroundColor: 'rgba(214, 40, 40, 0.18)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Income',
                    data: data.monthly_totals.income,
                    borderColor: '#2a9d8f',
                    backgroundColor: 'rgba(42, 157, 143, 0.18)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Net',
                    data: data.monthly_totals.net,
                    borderColor: '#1d3557',
                    backgroundColor: 'rgba(29, 53, 87, 0.1)',
                    fill: false,
                    borderDash: [6, 4],
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    const categoryLabels = data.category_totals.map(item => item.category);
    const categoryTotals = data.category_totals.map(item => item.total);
    buildChart('chartCategoryTotals', {
        type: 'bar',
        data: {
            labels: categoryLabels,
            datasets: [{
                label: 'Total',
                data: categoryTotals,
                backgroundColor: '#3d5a80'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {display: false}
            }
        }
    });

    const avgLabels = data.category_avg.map(item => item.category);
    const avgValues = data.category_avg.map(item => item.avg);
    buildChart('chartCategoryAvg', {
        type: 'bar',
        data: {
            labels: avgLabels,
            datasets: [{
                label: 'Avg / month',
                data: avgValues,
                backgroundColor: '#8d99ae'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            },
            plugins: {
                legend: {display: false}
            }
        }
    });

    const categoryTrendDatasets = data.category_monthly.map((item, index) => ({
        label: item.category,
        data: item.data,
        borderColor: colors[index % colors.length],
        backgroundColor: 'rgba(0,0,0,0)',
        tension: 0.3
    }));

    buildChart('chartCategoryTrends', {
        type: 'line',
        data: {
            labels: months,
            datasets: categoryTrendDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {position: 'bottom'}
            },
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCompact(value)
                    }
                }
            }
        }
    });

    buildChart('chartTravelMonthly', {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Travel',
                data: data.travel.monthly_totals,
                backgroundColor: 'rgba(67, 170, 139, 0.6)',
                borderColor: '#43aa8b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {legend: {display: false}},
            scales: {
                y: {
                    ticks: {callback: value => formatCompact(value)}
                }
            }
        }
    });

    const tripLabels = data.travel.trips.map(item => item.trip);
    const tripTotals = data.travel.trips.map(item => item.total);
    buildChart('chartTravelTrips', {
        type: 'bar',
        data: {
            labels: tripLabels,
            datasets: [{
                label: 'Trip total',
                data: tripTotals,
                backgroundColor: '#f4a261'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {ticks: {callback: value => formatCompact(value)}}
            },
            plugins: {legend: {display: false}}
        }
    });

    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    buildChart('chartWeekday', {
        type: 'bar',
        data: {
            labels: weekdayLabels,
            datasets: [{
                label: 'Spend',
                data: data.weekday_totals,
                backgroundColor: '#577590'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {legend: {display: false}},
            scales: {
                y: {ticks: {callback: value => formatCompact(value)}}
            }
        }
    });
}

async function loadDashboard(monthsBack) {
    setStatus('Loading dashboard data...');
    try {
        const response = await betterFetch(`${url}/dashboard?months=${monthsBack}&who=${currentPerson}`);
        const data = await response.json();
        updateKpis(data);
        renderCharts(data);
        setStatus(`Showing ${monthsBack} months for ${currentPerson}.`);
    } catch (err) {
        handleError(err);
        setStatus('Unable to load dashboard data.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    authenticate();
    const rangeSelect = document.getElementById('rangeSelect');
    const toggleButtons = Array.from(document.querySelectorAll('.toggle-button'));
    currentPerson = getPreferredPerson();

    toggleButtons.forEach(button => {
        button.classList.toggle('is-active', button.dataset.person === currentPerson);
        button.addEventListener('click', () => {
            currentPerson = button.dataset.person;
            toggleButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.person === currentPerson));
            loadDashboard(parseInt(rangeSelect.value, 10));
        });
    });

    loadDashboard(parseInt(rangeSelect.value, 10));

    rangeSelect.addEventListener('change', () => {
        const monthsBack = parseInt(rangeSelect.value, 10);
        loadDashboard(monthsBack);
    });
});
