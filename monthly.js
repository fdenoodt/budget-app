const url = config.url;

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
    options.headers = { 'Authorization': 'Basic ' + btoa(getKey()) };
    return fetch(fullUrl, options);
}

const categories_basics_keys = ['Boodschappen', 'Bakker', 'Gezondheid en verzorging', 'Transport', 'Auto', 'TUe'];
const categories_fun_keys = ['Restaurant', 'CafAc en Drinks', 'Amusement', 'Sport', 'Shopping', 'Inkomst'];
const categories_infreq_keys = ['Abonnementen', 'Kleding', 'Schoenen', 'Kapper', 'Gifts', 'Reizen', 'Meubels en Interieur', 'Zelfontwikkeling', 'ICT', 'Maandelijks', 'Uitzonderlijk'];

const allCategories = Array.from(new Set([
    ...categories_basics_keys,
    ...categories_fun_keys,
    ...categories_infreq_keys
]));

const fillCategories = () => {
    const select = document.getElementById('monthly-category');
    select.innerHTML = allCategories.map(category => `<option value="${category}">${category}</option>`).join('');
};

const updateAddSplitPreview = () => {
    const totalInput = document.getElementById('monthly-total');
    const ratioInput = document.getElementById('monthly-ratio');
    const categorySelect = document.getElementById('monthly-category');
    const fabianLabel = document.getElementById('monthly-fabian');
    const elisaLabel = document.getElementById('monthly-elisa');

    const totalVal = parseFloat(totalInput.value) || 0;
    const ratio = parseFloat(ratioInput.value) || 50;
    const category = categorySelect.value;
    const signedTotal = category === 'Inkomst' ? -Math.abs(totalVal) : Math.abs(totalVal);
    const fabian = signedTotal * (ratio / 100);
    const elisa = signedTotal - fabian;
    fabianLabel.textContent = `Fabian: €${fabian.toFixed(2)}`;
    elisaLabel.textContent = `Elisa: €${elisa.toFixed(2)}`;
};

const renderMonthlyRows = (rows) => {
    const container = document.getElementById('monthly-rows');
    container.innerHTML = '';

    rows.forEach(row => {
        const wrapper = document.createElement('div');
        wrapper.className = 'monthly-row';
        wrapper.innerHTML = `
            <div>
                <input type="date" class="form-control start-date" value="${row.start_date || ''}">
                <input type="date" class="form-control end-date" value="${row.end_date || ''}">
            </div>
            <div>
                <select class="form-select category">${allCategories.map(category => `<option value="${category}">${category}</option>`).join('')}</select>
            </div>
            <div>
                <input type="text" class="form-control description" value="${row.description || ''}">
            </div>
            <div>
                <select class="form-select paid-by">
                    <option value="fabian">Fabian</option>
                    <option value="elisa">Elisa</option>
                </select>
            </div>
            <div>
                <input type="number" class="form-control price-fabian" step="0.01" value="${(row.price_fabian ?? 0).toFixed(2)}">
            </div>
            <div>
                <input type="number" class="form-control price-elisa" step="0.01" value="${(row.price_elisa ?? 0).toFixed(2)}">
            </div>
            <div class="monthly-actions">
                <button class="button save">Save</button>
                <button class="button delete">Delete</button>
            </div>
        `;

        wrapper.querySelector('.category').value = row.category || '';
        wrapper.querySelector('.paid-by').value = (row.paid_by || 'fabian').toLowerCase();

        wrapper.querySelector('.save').addEventListener('click', () => {
            const payload = new URLSearchParams();
            payload.set('id', row.id);
            payload.set('start_date', wrapper.querySelector('.start-date').value);
            payload.set('end_date', wrapper.querySelector('.end-date').value);
            payload.set('category', wrapper.querySelector('.category').value);
            payload.set('description', wrapper.querySelector('.description').value || '');
            payload.set('paid_by', wrapper.querySelector('.paid-by').value);
            payload.set('price_fabian', parseFloat(wrapper.querySelector('.price-fabian').value || 0).toFixed(2));
            payload.set('price_elisa', parseFloat(wrapper.querySelector('.price-elisa').value || 0).toFixed(2));
            betterFetch(`${url}/edit_monthly_expense?${payload.toString()}`)
                .then(resp => resp.json())
                .then(loadMonthlyExpenses)
                .catch(handleError);
        });

        wrapper.querySelector('.delete').addEventListener('click', () => {
            if (!confirm(`Delete monthly expense ${row.id}?`)) return;
            betterFetch(`${url}/delete_monthly_expense?id=${row.id}`)
                .then(resp => resp.json())
                .then(loadMonthlyExpenses)
                .catch(handleError);
        });

        container.appendChild(wrapper);
    });
};

const loadMonthlyExpenses = () => {
    betterFetch(`${url}/monthly_expenses`)
        .then(resp => resp.json())
        .then(renderMonthlyRows)
        .catch(handleError);
};

document.addEventListener('DOMContentLoaded', () => {
    authenticate();
    fillCategories();
    updateAddSplitPreview();
    loadMonthlyExpenses();

    document.getElementById('monthly-total').addEventListener('input', updateAddSplitPreview);
    document.getElementById('monthly-ratio').addEventListener('input', updateAddSplitPreview);
    document.getElementById('monthly-category').addEventListener('change', updateAddSplitPreview);

    document.getElementById('monthly-add').addEventListener('click', () => {
        const startDate = document.getElementById('monthly-start-date').value;
        const endDate = document.getElementById('monthly-end-date').value;
        const category = document.getElementById('monthly-category').value;
        const description = document.getElementById('monthly-description').value || '';
        const paidBy = document.getElementById('monthly-paid-by').value;
        const total = parseFloat(document.getElementById('monthly-total').value) || 0;
        const ratio = parseFloat(document.getElementById('monthly-ratio').value) || 50;
        const signedTotal = category === 'Inkomst' ? -Math.abs(total) : Math.abs(total);
        const priceFabian = signedTotal * (ratio / 100);
        const priceElisa = signedTotal - priceFabian;

        if (!startDate || !category) {
            alert('Start date and category are required.');
            return;
        }

        const payload = new URLSearchParams();
        payload.set('start_date', startDate);
        payload.set('end_date', endDate);
        payload.set('category', category);
        payload.set('description', description);
        payload.set('paid_by', paidBy);
        payload.set('price_fabian', priceFabian.toFixed(2));
        payload.set('price_elisa', priceElisa.toFixed(2));
        payload.set('subcategory', '');

        betterFetch(`${url}/add_monthly_expense?${payload.toString()}`)
            .then(resp => resp.json())
            .then(() => {
                document.getElementById('monthly-description').value = '';
                document.getElementById('monthly-total').value = '';
                updateAddSplitPreview();
                loadMonthlyExpenses();
            })
            .catch(handleError);
    });
});
