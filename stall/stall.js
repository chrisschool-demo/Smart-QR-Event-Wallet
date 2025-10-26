import { db } from '../firebase-config.js';
import { doc, getDoc, collection, query, where, getDocs, runTransaction, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- STATE MANAGEMENT ---
let currentStall = null;
let currentStudent = null;
let products = [];

// --- UI ELEMENTS ---
const stallLoginDiv = document.getElementById('stall-login');
const stallDashboardDiv = document.getElementById('stall-dashboard');
const stallNameDisplay = document.getElementById('stall-name-display');
const totalSalesEl = document.getElementById('total-sales');
const salesHistoryDiv = document.getElementById('sales-history');

const transactionModal = document.getElementById('transaction-modal');
const productSelect = document.getElementById('product-select');
const quantityInput = document.getElementById('quantity-input');
const totalAmountEl = document.getElementById('total-amount');
const modalStudentName = document.getElementById('modal-student-name');
const modalStudentBalance = document.getElementById('modal-student-balance');

const confirmBtn = document.getElementById('confirm-btn');
const cancelBtn = document.getElementById('cancel-btn');


// --- SCANNER LOGIC ---
let loginScanner = new Html5Qrcode("login-scanner");
let studentScanner = new Html5Qrcode("student-scanner");

// Login Scanner Success
const onLoginScanSuccess = (decodedText, decodedResult) => {
    console.log(`Login QR Scanned: ${decodedText}`);
    try {
        const url = new URL(decodedText);
        const stallId = url.searchParams.get("id");
        if (stallId && stallId.startsWith("stall_")) {
            loginScanner.stop();
            initializeStallDashboard(stallId);
        } else {
            alert("Invalid stall QR code.");
        }
    } catch (e) {
        alert("Invalid QR code format.");
    }
};

// Student Scanner Success
const onStudentScanSuccess = async (decodedText, decodedResult) => {
    console.log(`Student QR Scanned: ${decodedText}`);
    try {
        const url = new URL(decodedText);
        const studentId = url.searchParams.get("id");
        if (studentId && studentId.startsWith("stu_")) {
            const studentDoc = await getDoc(doc(db, "users", studentId));
            if (studentDoc.exists()) {
                currentStudent = studentDoc.data();
                studentScanner.pause(true); // Pause scanner
                openTransactionModal();
            } else {
                alert("Student not found.");
            }
        } else {
            alert("This is not a valid student QR code.");
        }
    } catch (e) {
        alert("Invalid QR code format.");
    }
};

const scannerConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

// --- MAIN FUNCTIONS ---

async function initializeStallDashboard(stallId) {
    const stallDoc = await getDoc(doc(db, "users", stallId));
    if (!stallDoc.exists() || stallDoc.data().role !== 'stall') {
        alert("Stall not found. Please use a valid stall QR code.");
        loginScanner.start({ facingMode: "environment" }, scannerConfig, onLoginScanSuccess, console.error);
        return;
    }

    currentStall = stallDoc.data();
    stallLoginDiv.style.display = 'none';
    stallDashboardDiv.style.display = 'block';
    stallNameDisplay.textContent = currentStall.name;

    await loadProducts();
    listenForSales();
    
    // Start the student scanner after login
    studentScanner.start({ facingMode: "environment" }, scannerConfig, onStudentScanSuccess, console.error);
}

async function loadProducts() {
    products = [];
    productSelect.innerHTML = '';
    const q = query(collection(db, "products"), where("stallId", "==", currentStall.id));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        products.push(doc.data());
        const option = document.createElement('option');
        option.value = doc.data().id;
        option.textContent = `${doc.data().name} - ₹${doc.data().price}`;
        productSelect.appendChild(option);
    });
    updateTotalAmount(); // Initial calculation
}

function listenForSales() {
    const q = query(collection(db, "transactions"), where("stallId", "==", currentStall.id));
    onSnapshot(q, (snapshot) => {
        let total = 0;
        const sales = [];
        snapshot.forEach(doc => {
            const tx = doc.data();
            sales.push(tx);
            total += tx.totalAmount;
        });

        totalSalesEl.textContent = `₹${total.toFixed(2)}`;
        
        sales.sort((a,b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        salesHistoryDiv.innerHTML = sales.map(tx => `
            <div class="p-2 border-b">
                <p><strong>${tx.studentName}</strong> - ${tx.productName} (x${tx.quantity})</p>
                <p class="flex justify-between">
                    <span class="text-sm text-gray-500">${new Date(tx.timestamp.toMillis()).toLocaleTimeString()}</span>
                    <span class="font-bold text-green-600">+ ₹${tx.totalAmount.toFixed(2)}</span>
                </p>
            </div>
        `).join('');
    });
}

function updateTotalAmount() {
    const selectedProduct = products.find(p => p.id === productSelect.value);
    const quantity = parseInt(quantityInput.value) || 1;
    if (selectedProduct) {
        const total = selectedProduct.price * quantity;
        totalAmountEl.textContent = `₹${total.toFixed(2)}`;
    }
}

function openTransactionModal() {
    modalStudentName.textContent = currentStudent.name;
    modalStudentBalance.textContent = `₹${currentStudent.balance.toFixed(2)}`;
    quantityInput.value = 1;
    updateTotalAmount();
    transactionModal.classList.remove('hidden');
}

function closeTransactionModal() {
    transactionModal.classList.add('hidden');
    currentStudent = null;
    studentScanner.resume(); // Resume scanner
}

async function processTransaction() {
    const selectedProduct = products.find(p => p.id === productSelect.value);
    const quantity = parseInt(quantityInput.value);
    const totalAmount = selectedProduct.price * quantity;

    if (currentStudent.balance < totalAmount) {
        alert("Insufficient balance!");
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const studentRef = doc(db, "users", currentStudent.id);
            const studentDoc = await transaction.get(studentRef);

            if (!studentDoc.exists()) {
                throw "Student does not exist!";
            }

            const newBalance = studentDoc.data().balance - totalAmount;
            if (newBalance < 0) {
                throw "Transaction failed: Insufficient balance on verification.";
            }

            transaction.update(studentRef, { balance: newBalance });
            
            // Log the transaction
            const transactionRef = doc(collection(db, "transactions"));
            transaction.set(transactionRef, {
                studentId: currentStudent.id,
                studentName: currentStudent.name,
                stallId: currentStall.id,
                stallName: currentStall.name,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: quantity,
                totalAmount: totalAmount,
                timestamp: serverTimestamp()
            });
        });

        alert("Transaction Successful!");
        closeTransactionModal();
    } catch (e) {
        console.error("Transaction failed: ", e);
        alert("Transaction failed. Please try again.");
    }
}


// --- EVENT LISTENERS ---
productSelect.addEventListener('change', updateTotalAmount);
quantityInput.addEventListener('input', updateTotalAmount);
cancelBtn.addEventListener('click', closeTransactionModal);
confirmBtn.addEventListener('click', processTransaction);

// --- INITIALIZATION ---
// Check if an ID is in the URL for direct login
const urlParams = new URLSearchParams(window.location.search);
const stallIdFromUrl = urlParams.get('id');

if (stallIdFromUrl) {
    initializeStallDashboard(stallIdFromUrl);
} else {
    // If no ID, start the login scanner
    stallDashboardDiv.style.display = 'none';
    stallLoginDiv.style.display = 'block';
    loginScanner.start({ facingMode: "environment" }, scannerConfig, onLoginScanSuccess, console.error);
}
