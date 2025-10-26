import { db } from '../firebase-config.js';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc, increment } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- STATE & UI ELEMENTS ---
let currentStudentId = null;

const studentLoginDiv = document.getElementById('student-login');
const studentDashboardDiv = document.getElementById('student-dashboard');
const studentNameDisplay = document.getElementById('student-name-display');
const walletBalanceEl = document.getElementById('wallet-balance');
const stallsListDiv = document.getElementById('stalls-list');
const transactionHistoryDiv = document.getElementById('transaction-history');

// Recharge Modal
const rechargeBtn = document.getElementById('recharge-btn');
const rechargeModal = document.getElementById('recharge-modal');
const confirmRechargeBtn = document.getElementById('confirm-recharge-btn');
const cancelRechargeBtn = document.getElementById('cancel-recharge-btn');
const rechargeAmountInput = document.getElementById('recharge-amount');

// --- SCANNER ---
let loginScanner = new Html5Qrcode("login-scanner");

const onLoginScanSuccess = (decodedText, decodedResult) => {
    console.log(`Login QR Scanned: ${decodedText}`);
    try {
        const url = new URL(decodedText);
        const studentId = url.searchParams.get("id");
        if (studentId && studentId.startsWith("stu_")) {
            loginScanner.stop();
            initializeStudentDashboard(studentId);
        } else {
            alert("Invalid student QR code.");
        }
    } catch (e) {
        alert("Invalid QR code format.");
    }
};

const scannerConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

// --- MAIN FUNCTIONS ---

function initializeStudentDashboard(studentId) {
    currentStudentId = studentId;
    studentLoginDiv.style.display = 'none';
    studentDashboardDiv.style.display = 'block';

    // Set up real-time listener for student data (balance, etc.)
    const studentDocRef = doc(db, "users", studentId);
    onSnapshot(studentDocRef, (doc) => {
        if (doc.exists()) {
            const studentData = doc.data();
            studentNameDisplay.textContent = `Welcome, ${studentData.name}!`;
            walletBalanceEl.textContent = `₹${studentData.balance.toFixed(2)}`;
        } else {
            console.error("Student document not found!");
            studentDashboardDiv.innerHTML = '<p class="text-red-500 text-center">Error: Could not load student data.</p>';
        }
    });

    loadTransactionHistory(studentId);
    loadStallsAndMenus();
}

async function loadTransactionHistory(studentId) {
    const q = query(collection(db, "transactions"), where("studentId", "==", studentId));
    onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach(doc => transactions.push(doc.data()));

        transactions.sort((a,b) => b.timestamp.toMillis() - a.timestamp.toMillis());

        transactionHistoryDiv.innerHTML = transactions.map(tx => `
            <div class="p-2 border-b">
                <p>Purchase at <strong>${tx.stallName}</strong></p>
                <p class="flex justify-between">
                    <span class="text-sm text-gray-500">${new Date(tx.timestamp.toMillis()).toLocaleString()}</span>
                    <span class="font-bold text-red-600">- ₹${tx.totalAmount.toFixed(2)}</span>
                </p>
            </div>
        `).join('') || '<p class="text-gray-500">No transactions yet.</p>';
    });
}

async function loadStallsAndMenus() {
    stallsListDiv.innerHTML = '<p>Loading stalls...</p>';
    const stallsQuery = query(collection(db, "users"), where("role", "==", "stall"));
    const productsQuery = collection(db, "products");

    const [stallsSnapshot, productsSnapshot] = await Promise.all([getDocs(stallsQuery), getDocs(productsQuery)]);
    
    const productsByStall = {};
    productsSnapshot.forEach(doc => {
        const product = doc.data();
        if (!productsByStall[product.stallId]) {
            productsByStall[product.stallId] = [];
        }
        productsByStall[product.stallId].push(product);
    });

    stallsListDiv.innerHTML = '';
    stallsSnapshot.forEach(doc => {
        const stall = doc.data();
        const menuItems = productsByStall[stall.id] || [];
        const menuHTML = menuItems.map(p => `
            <li class="flex justify-between">
                <span>${p.name}</span>
                <span class="font-semibold">₹${p.price}</span>
            </li>
        `).join('');

        stallsListDiv.innerHTML += `
            <div class="bg-gray-50 p-4 rounded-lg">
                <h3 class="text-lg font-bold">${stall.name}</h3>
                <ul class="mt-2 text-sm space-y-1">
                    ${menuHTML || '<li class="text-gray-500">No items listed.</li>'}
                </ul>
            </div>
        `;
    });
}

// --- RECHARGE LOGIC ---
rechargeBtn.addEventListener('click', () => {
    rechargeModal.classList.remove('hidden');
});

cancelRechargeBtn.addEventListener('click', () => {
    rechargeModal.classList.add('hidden');
});

confirmRechargeBtn.addEventListener('click', async () => {
    const amount = parseFloat(rechargeAmountInput.value);
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    // --- Mock UPI Payment Simulation ---
    confirmRechargeBtn.disabled = true;
    confirmRechargeBtn.textContent = 'Redirecting to payment...';

    setTimeout(async () => {
        // This simulates a successful payment callback
        try {
            const studentRef = doc(db, "users", currentStudentId);
            await updateDoc(studentRef, {
                balance: increment(amount)
            });
            alert(`Recharge successful! ₹${amount} has been added to your wallet.`);
        } catch (error) {
            console.error("Error updating balance: ", error);
            alert("There was an error processing your recharge.");
        } finally {
            rechargeModal.classList.add('hidden');
            rechargeAmountInput.value = '';
            confirmRechargeBtn.disabled = false;
            confirmRechargeBtn.textContent = 'Proceed to Pay';
        }
    }, 2000); // 2-second delay to simulate redirection
});

// --- INITIALIZATION ---
const urlParams = new URLSearchParams(window.location.search);
const studentIdFromUrl = urlParams.get('id');

if (studentIdFromUrl) {
    initializeStudentDashboard(studentIdFromUrl);
} else {
    // If no ID, show login scanner
    studentDashboardDiv.style.display = 'none';
    studentLoginDiv.style.display = 'block';
    loginScanner.start({ facingMode: "environment" }, scannerConfig, onLoginScanSuccess, console.error);
}
