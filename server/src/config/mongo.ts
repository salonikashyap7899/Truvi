import mongoose from "mongoose";

export async function connectMongo(uri: string): Promise<boolean> {
  if (!uri || uri.trim() === "") {
    console.warn("No MONGO_URI configured. MongoDB-backed routes will fail without it.");
    return false;
  }

  try {
    await mongoose.connect(uri, { dbName: "truvi" });
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    console.warn(`Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
