// import from openai library to work with ChatGPT
export async function generateAIResponse() {
    
  const snapshot = await firestore.collection(COLLECTION).limit(0).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}